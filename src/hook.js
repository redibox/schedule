const later = require('later');
const Promise = require('bluebird');
const {
  deepGet,
  sha1sum,
  BaseHook,
  isFunction,
  tryJSONParse,
  tryJSONStringify,

} = require('redibox');

/**
 * Internal Imports
 */
const scripts = require('./scripts');
const defaults = require('./defaults');
const {
  microTime,
  parseScheduleTimes,
  dateToUnixTimestamp,
  dateFromUnixTimestamp,
  ExponentialRetries,
} = require('./utils');

/**
 * RediBox Scheduler Hook
 * Provides 1sec precision schedules in easy configurable human formats.
 */
class Scheduler extends BaseHook {
  constructor() {
    super('schedule');
    this.state = 'stopped';
    this.lastTick = null;
    this.processTimer = null;
    this.lastTickTimeTaken = null;
    this.exponenRetry = new ExponentialRetries();
  }

  /**
   * ----------------
   *   HOOK METHODS
   * ----------------
   */
  /**
   *
   * @returns {Promise.<T>}
   */
  initialize() {
    this.exponenRetry.create('doWorkError', this.options.processInterval, 45, 0.5);
    this.exponenRetry.create('doWorkLock', this.options.processInterval, 15, 0.1);

    if (this.options.enabled) {
      this.on('core:ready', () => {
        // create all default schedules
        this._createDefaultSchedules();

        // subscribe to multi node schedule events
        this.core.pubsub.subscribe(this.toEventName('runMultiJob'), this._onMultiScheduleEvent.bind(this));

        // creating blocking client for internal work queue
        this.createClient('block');
        this.on(this.toEventName('client:block:ready'), this._beginWorking.bind(this));
      });
    }

    return Promise.resolve();
  }

  /**
   *
   * @returns {*}
   * @private
   */
  _createDefaultSchedules() {
    const promises = [];
    if (this.options.schedules && this.options.schedules.length) {
      for (let i = 0, len = this.options.schedules.length; i < len; i += 1) {
        promises.push(this.createOrUpdate(Object.assign({}, this.options.schedules[i], { default: true }), true));
      }
    }

    return Promise.all(promises);
  }

  // noinspection JSUnusedGlobalSymbols,JSMethodCanBeStatic
  /**
   * Default config for scheduler
   * @returns {{someDefaultThing: string}}
   */
  defaults() {
    return defaults;
  }

  /**
   * Return schedule scripts for bootstrapping
   * @returns {{processUpcoming, removeSchedule, addSchedule, updateSchedule}}
   */
  scripts() {
    return scripts;
  }

  /**
   * -------------
   *  PUBLIC API
   * -------------
   */

  // TODO start stop
  // start() {
  //   // todo pubsub to other workers so that they start also
  //   this._beginWorking();
  // }
  //
  // stop() {
  //   // todo pubsub to other workers so that they stop also
  //   this._stopWorking();
  // }

  findOne(name) {
    return this.client.hget(
      this._toKey('schedules'),
      name
    ).then((result) => {
      if (!result) return null;
      return tryJSONParse(result);
    });
  }

  // TODO find schedule api
  // /**
  //  *
  //  * @returns {*}
  //  */
  // find() {
  //   return this.client.hgetall(
  //     this._toKey('schedules')
  //   );
  // }

  /**
   *
   * @param schedule
   * @returns {Promise.<TResult>}
   */
  create(schedule) {
    this.log.verbose(`create schedule '${schedule.name}'`);
    return this.client.hset(
      this._toKey('schedules'),
      schedule.name,
      tryJSONStringify(schedule)
    ).then(() => {
      if (!schedule.enabled || !schedule.occurrence.next) return schedule;
      this._createNextOccurrence(schedule);
      return schedule;
    });
  }

  /**
   *
   * @param name
   * @returns {*}
   */
  destroy(name) {
    this.log.verbose(`create schedule '${name}'`);
    return this.client.hdel(
      this._toKey('schedules'),
      name
    );
  }

  // TODO updater logic
  // update(schedule) {
  //   this.log.verbose(`update schedule '${schedule.name}'`);
  // }

  /**
   *
   * @param schedule
   * @returns {Error}
   */
  validate(schedule) {
    if (!schedule.name) return new Error('Missing schedule name.');
    if (!schedule.runs || typeof schedule.runs !== 'string') return new Error('Missing schedule \'runs\' string property.');
    if (!schedule.interval) return new Error('Missing schedule \'interval\' property.');
    return parseScheduleTimes(schedule);
  }

  /**
   * Create or update a schedule
   * @param schedule
   * @param createOnly
   * @returns {*}
   */
  createOrUpdate(schedule, createOnly) {
    this.log.verbose(`createOrUpdate schedule '${schedule.name}'`);
    const validation = this.validate(schedule);
    if (validation instanceof Error) return Promise.reject(validation);
    if (!Object.hasOwnProperty.call(schedule, 'enabled')) schedule.enabled = true;
    schedule.lastRan = 0;
    schedule.timesRan = 0;
    schedule.occurrence = validation;
    schedule.versionHash = this._createOccurrenceHash(schedule);
    return this.findOne(schedule.name).then((existing) => {
      if (!existing) return this.create(schedule);
      if (createOnly) return Promise.resolve(existing);
      return Promise.resolve(existing);
      // TODO updater logic
      // this.log.debug('Found existing schedule', existing);
      // return this.update(schedule, existing, validation);
    });
  }

  /**
   * -------------
   *   INTERNALS
   * -------------
   */

  /**
   * Create a sha1sum hash of the interval name and starts / ends properties.
   * We use this to validate changes on schedule intervals - so old intervals are skipped.
   * @param schedule
   * @private
   */
  _createOccurrenceHash(schedule) {
    return sha1sum(`${schedule.name}${schedule.interval}${schedule.starts}${schedule.ends}`);
  }

  /**
   *
   * @param schedule
   * @private
   */
  _createNextOccurrence(schedule) {
    if (schedule.enabled && (!schedule.occurrence.endInput || schedule.lastRan <= schedule.occurrence.ends) && !schedule.occurrence.onceCompleted) {
      let next = schedule.lastRan;

      if (!next) {
        next = schedule.occurrence.next;
      } else {
        if (!schedule.now) schedule.now = dateToUnixTimestamp();
        const startDate = schedule.occurrence.starts < schedule.now ? new Date((schedule.now - 1) * 1000) : new Date((schedule.occurrence.starts - 1) * 1000);
        next = later.schedule(schedule.occurrence.laterSchedule).next(2, startDate, schedule.occurrence.endInput ? new Date(schedule.occurrence.ends * 1000) : null);
        if (next && next[0].getTime() === startDate.getTime()) next.shift();
        if (!next || !next.length) return;
        next = next[0];
        next = dateToUnixTimestamp(next);
      }

      schedule.key = `${schedule.name}|||${schedule.versionHash}`;
      schedule.occurrenceKey = this._toKey(`${schedule.key}:${next}`);

      this.client.addoccurrence(
        this._toKey('waiting'),
        schedule.occurrenceKey,
        this._toKey('schedules'),
        next,
        dateFromUnixTimestamp(next).toISOString(),
        this.options.occurrenceLockTime,
        schedule.key,
        schedule.name,
        (error, result) => {
          if (error) this.log.error(error);
          if (typeof result === 'string') {
            this.log.verbose(`Schedule '${schedule.key}' for occurrence timestamp '${next}' has already been created so was ignored.`);
          } else {
            this.log.verbose(`Schedule '${schedule.key}' for occurrence timestamp '${next}' created.`);
          }
        }
      );
    } else {
      // TODO don't think it'll actually ever get here?
      this.log.verbose(`Schedule '${schedule.name}' has expired or is no longer enabled. { enabled: ${schedule.enabled}, ends: ${schedule.occurrence.ends} }`);
    }
  }

  /**
   *
   * @param event
   * @private
   */
  _onMultiScheduleEvent(event) {
    this._runSchedule(event.data, true);
  }

  /**
   *
   * @param schedule
   * @param fromMulti
   * @returns {*}
   * @private
   */
  _runSchedule(schedule, fromMulti) {
    // ignore schedules from multi event if the event origin is the same as this instance
    if (fromMulti && schedule.coreId === this.core.id) return null;
    // if we're a 'multi' instance schedule tell other workers to run the same schedule
    if (!fromMulti && schedule.multi) {
      this.core.pubsub.publish(this.toEventName('runMultiJob'), Object.assign({ coreId: this.core.id }, schedule));
    }

    schedule.now = dateToUnixTimestamp() + 1;
    schedule.fromMulti = fromMulti || false;

    // create the next occurrence - we do this before and after a job runs just to
    // be sure - they can't duplicate so no harm in doing this twice
    if (!fromMulti && !schedule.occurrence.onceCompleted) this._createNextOccurrence(schedule);

    const runner = deepGet(global, schedule.runs);

    if (!isFunction(runner)) {
      return this._onScheduleFailure.bind(
        this, schedule,
        new Error(`Schedule invalid, expected a function or a global string dot notated path to a function - ${JSON.stringify(schedule)}`)
      )();
    }

    // exec schedule runner
    // TODO try catcher
    const possiblePromise = runner(schedule);

    if (!possiblePromise || !possiblePromise.then) {
      // stinky error check - TODO improve?
      if (possiblePromise && possiblePromise.stack) return this._onScheduleFailure(schedule, possiblePromise);
      return this._onScheduleSuccess(schedule);
    }

    // if a promise is detected
    return possiblePromise.then(
      this._onScheduleSuccess.bind(this, schedule),
      this._onScheduleFailure.bind(this, schedule)
    ).catch(this._onScheduleFailure.bind(this, schedule));
  }

  /**
   *
   * @private
   */
  _restartProcessing(error) {
    if (error) this.log.error(error);
    this.clients.block.once('ready', this._scheduleQueueTick.bind(this));
  }

  /**
   *
   * @private
   */
  _onLocalTickComplete() {
    setImmediate(this._scheduleQueueTick.bind(this));
  }

  /**
   *
   * @param error
   * @private
   */
  _onLocalTickError(error) {
    this.log.error(error);
    setImmediate(this._scheduleQueueTick.bind(this));
  }

  /**
   *
   * @param cb
   * @private
   */
  _getNextScheduleJob(cb) {
    this.log.debug('Getting next schedule from work queue.');
    this.clients.block.brpoplpush(
      this._toKey('queued'),
      this._toKey('active'),
      0, (pushError, schedule) => {
        if (pushError) {
          cb(pushError);
        } else {
          const _schedule = tryJSONParse(schedule);
          _schedule.raw = schedule;
          cb(null, _schedule);
        }
      });
  }

  /**
   *
   * @private
   */
  _scheduleQueueTick() {
    if (this.options.enabled) {
      this.log.debug('Schedule queue tick');
      this._getNextScheduleJob((err, schedule) => {
        if (err) {
          this._onLocalTickError.bind(this)(err);
        } else {
          this._onLocalTickComplete.bind(this)();
          this._runSchedule.bind(this)(schedule);
        }
      });
    }
  }


  /**
   *
   * @private
   */
  _beginWorking() {
    if (this.options.enabled && !this.processTimer) {
      this.log.debug('Begin Working');
      this.processTimer = setTimeout(this._doWork.bind(this), this.options.processInterval);
      this.state = 'active';
      this.clients.block.once('error', this._restartProcessing.bind(this));
      this.clients.block.once('close', this._restartProcessing.bind(this));

      // TODO
      // this.checkStalledSchedules.bind(this)();
      this._scheduleQueueTick.bind(this)();
    }
  }

  /**
   *
   * @private
   */
  // TODO stop process - also reset exporetries
  // _stopWorking() {
  //   clearTimeout(this.processTimer);
  //   this.state = 'stopped';
  //   this.lastTick = null;
  // }

  /**
   *
   * @returns {boolean}
   * @private
   */
  _doWork() {
    if (this.state === 'stopped') return false;
    this.lastTick = microTime();
    return this.client.processtick(
      this._toKey('waiting'),
      this._toKey('queued'),
      this._toKey('active'),
      this._toKey('schedules'),
      this._toKey('lock'),
      this._toKey('hello'), // used for flush detection
      dateToUnixTimestamp(),
      this.options.processIntervalLock,
      this.core.id, // use the the worker id as the lock hash
      this.options.processInterval,
      (error, result) => {
        if (error) {
          this.log.error(error);
          this.processTimer = setTimeout(
            this._doWork.bind(this),
            this.exponenRetry.getDelay('doWorkError')
          );
        } else {
          if (typeof result === 'string') {
            this.log.debug(`Work script ran but was already locked by worker '${result}'.`);
          } else {
            this.lastTickTimeTaken = (microTime() - this.lastTick).toFixed(2);
            this.log.debug(`Work script ran and moved ${result[0]} occurrences in ${this.lastTickTimeTaken}ms.`);
            this.exponenRetry.reset('doWorkLock');

            // flush detection - seems to be a bug in ioredis where if cluster it sometimes returns the result as a buffer
            if (result[1] === 'OK' || (Buffer.isBuffer(result[1]) && result[1].toString() === 'OK')) {
              this.log.verbose('Uh-oh, looks like something has been flushed on redis, recreating all default schedules.');
              this._createDefaultSchedules();
            }
          }

          this.exponenRetry.reset('doWorkError');

          this.processTimer = setTimeout(
            this._doWork.bind(this),
            this.exponenRetry.getDelay('doWorkLock')
          );
        }
      }
    );
  }

  /**
   *
   * @param schedule
   * @private
   */
  // TODO - add result arg and track schedule completions with a capped list
  // TODO - 2nd arg is success result, 3rd arg is error if it failed
  _completeOccurrence(schedule) {
    if (schedule.occurrenceKey) {
      this.client.completeoccurrence(
        schedule.occurrenceKey,
        this._toKey('active'),
        this._toKey('stalling'),
        Math.ceil(this.options.occurrenceLockTime / 6),
        schedule.raw,
        schedule.key,
        (error) => {
          if (error) this.log.error(error);
          this.log.debug(`Completed occurrence '${schedule.occurrenceKey}'.`);
        }
      );
    }
  }

  /**
   *
   * @param schedule
   * @param result
   */
  _onScheduleSuccess(schedule, result) {
    // const hasListeners = this.listenerCount('onScheduleSuccess') > 0;
    if (!this.listeners('onScheduleFailure', true)) {
      this.log.info(`${new Date(schedule.lastRan * 1000).toISOString()}: Schedule '${schedule.name}' ${schedule.data ? JSON.stringify(schedule.data) : ''} has completed successfully.`);
    } else {
      this.emit('onScheduleSuccess', {
        schedule,
        result,
      });
    }
    this._completeOccurrence(schedule, result, null);
    if (schedule.enabled && !schedule.fromMulti && !schedule.occurrence.onceCompleted) return this._createNextOccurrence(schedule);
    return null;
  }

  /**
   *
   * @param schedule
   * @param error
   */
  _onScheduleFailure(schedule, error) {
    // const hasListeners = this.listeners('onScheduleFailure', true);
    if (!this.listeners('onScheduleFailure', true)) {
      this.log.error(`${new Date().toISOString()}: Schedule '${schedule.name}' ${schedule.data ? JSON.stringify(schedule.data) : ''} has failed to complete.`);
      this.log.error(error);
    } else {
      this.emit('onScheduleFailure', {
        schedule,
        error,
      });
    }
    this._completeOccurrence(schedule, null, error);
    if (schedule.enabled && !schedule.fromMulti && !schedule.occurrence.onceCompleted) return this._createNextOccurrence(schedule);
    return null;
  }

  /**
   *
   * @param str
   * @returns {string}
   */
  _toKey(str) {
    if (this.core.cluster.isCluster()) {
      return `{${this.name}}:${str}`;
    }
    return `${this.name}:${str}`;
  }
}

module.exports = Scheduler;
