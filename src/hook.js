const later = require('later');
const Promise = require('bluebird');
const {
  deepGet,
  sha1sum,
  BaseHook,
  isFunction,
  getTimeStamp,
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
    const promises = [];
    if (this.options.schedules && this.options.schedules.length) {
      for (let i = 0, len = this.options.schedules.length; i < len; i++) {
        promises.push(this.createOrUpdate(this.options.schedules[i], true));
      }
    }

    this.exponenRetry.create('doWorkError', this.options.processInterval, 45, 0.5);
    this.exponenRetry.create('doWorkLock', this.options.processInterval, 15, 0.1);

    this.createClient('block');
    this.on(this.toEventName('client:block:ready'), this._beginWorking.bind(this));
    return promises.length ? Promise.all(promises) : Promise.resolve();
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

  start() {
    // todo pubsub to other workers so that they start also
    this._beginWorking();
  }

  stop() {
    // todo pubsub to other workers so that they stop also
    this._stopWorking();
  }

  findOne(name) {
    return this.client.hget(
      this._toKey('schedules'),
      name
    ).then(result => {
      if (!result) return null;
      return tryJSONParse(result);
    });
  }

  find() {
    return this.client.hgetall(
      this._toKey('schedules')
    );
  }

  /**
   *
   * @param schedule
   * @param occurrence
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
      return this._createNextOccurrence(schedule);
    });
  }

  /**
   *
   * @param name
   * @returns {*}
   */
  destroy(name) {
    this.log.verbose(`create schedule '${name}'`);
    return this.client.hdet(
      this._toKey('schedules'),
      name
    );
  }

  update(schedule, existing) {
    this.log.verbose(`update schedule '${schedule.name}'`);
  }

  /**
   *
   * @param schedule
   * @returns {Error}
   */
  validate(schedule) {
    if (!schedule.name) return new Error('Missing schedule name.');
    if (!schedule.runs) return new Error('Missing schedule \'runs\' property.');
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
    return this.findOne(schedule.name).then(existing => {
      if (!existing) return this.create(schedule);
      if (createOnly) return Promise.resolve();
      this.log.debug('Found existing schedule', existing);
      return this.update(schedule, existing, validation);
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

  _createNextOccurrence(schedule) {
    if (schedule.enabled && (!schedule.occurrence.endInput || schedule.lastRan <= schedule.occurrence.ends) && schedule.occurrence.laterSchedule) {
      let next = schedule.lastRan;

      if (!next) {
        next = schedule.occurrence.next;
      } else {
        next = later.schedule(schedule.occurrence.laterSchedule).next(1, new Date(schedule.now * 1000), schedule.occurrence.endInput ? new Date(schedule.occurrence.ends * 1000) : null);
        if (!next) return;
        next = dateToUnixTimestamp(next);
      }

      const key = `${schedule.name}|||${schedule.versionHash}`;

      this.client.addoccurrence(
        this._toKey('waiting'),
        this._toKey(`${key}:${next}`),
        next,
        this.options.occurrenceLockTime,
        `${schedule.name}|||${schedule.versionHash}`,
        (error, result) => {
          if (error) this.log.error(error);
          if (typeof result === 'string') {
            this.log.verbose(`Schedule '${key}' for occurrence timestamp '${next}' has already been created so was ignored.`);
          } else {
            this.log.verbose(`Schedule '${key}' for occurrence timestamp '${next}' created.`);
          }
        }
      );
    } else {
      this.log(`Schedule '${schedule.name}' has expired or is no longer enabled. { enabled: ${schedule.enabled}, ends: ${schedule.occurrence.ends} }`);
    }
  }

  _runSchedule(schedule) {
    schedule.now = dateToUnixTimestamp() + 1;
    if (!schedule.runs) throw new Error(`Schedule is missing a runs parameter - ${JSON.stringify(schedule)}`);
    const runner = typeof schedule.runs === 'string' ? deepGet(global, schedule.runs) : schedule.runs;

    if (!isFunction(runner)) {
      return this.log.error(`Schedule invalid, expected a function or a global string dot notated path to a function - ${JSON.stringify(schedule)}`);
    }

    this._createNextOccurrence(schedule);

    const possiblePromise = runner(schedule);

    if (!possiblePromise.then) {
      // stinky error check
      if (possiblePromise && possiblePromise.stack) return this._onScheduleFailure(possiblePromise, schedule);
      return this._onScheduleSuccess(schedule);
    }

    return possiblePromise
      .then(this._onScheduleSuccess.bind(this, schedule), this._onScheduleFailure.bind(this, schedule))
      .catch(this._onScheduleFailure.bind(this, schedule));
  }

  _restartProcessing() {
    this.clients.block.once('ready', this._scheduleQueueTick.bind(this));
  }

  _onLocalTickComplete() {
    setImmediate(this._scheduleQueueTick.bind(this));
  }

  _onLocalTickError(error) {
    this.log.error(error);
    setImmediate(this._scheduleQueueTick.bind(this));
  }

  _getNextScheduleJob(cb) {
    this.log.debug('Getting next schedule from work queue.');
    this.clients.block.brpoplpush(
      this._toKey('queued'),
      this._toKey('active'),
      0, (pushError, schedule) => {
        if (pushError) {
          cb(pushError);
        } else {
          cb(null, tryJSONParse(schedule));
        }
      });
  }

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

  _stopWorking() {
    clearTimeout(this.processTimer);
    this.state = 'stopped';
    this.lastTick = null;
  }

  /**
   *
   * @returns {boolean}
   * @private
   */
  _doWork() {
    if (this.state === 'stopped') return false;
    this.lastTick = microTime();
    return this.client.processupcoming(
      this._toKey('waiting'),
      this._toKey('queued'),
      this._toKey('active'),
      this._toKey('schedules'),
      this._toKey('lock'),
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
            this.log.debug(`Work script ran and moved ${result} occurrences in ${this.lastTickTimeTaken}ms.`);
            this.exponenRetry.reset('doWorkLock');
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
   */
  _onScheduleSuccess(schedule) {
    this.log.info(`${new Date(schedule.lastRan * 1000).toISOString()}: Schedule '${schedule.name}' ${schedule.data ? JSON.stringify(schedule.data) : ''} has completed successfully.`);
    if (!schedule.enabled) return schedule;
    return this._createNextOccurrence(schedule);
  }

  /**
   *
   * @param schedule
   * @param error
   */
  _onScheduleFailure(schedule, error) {
    this.log.error(`${new Date().toISOString()}: Schedule '${schedule.name}' ${schedule.data ? JSON.stringify(schedule.data) : ''} has failed to complete.`);
    this.log.error(error);
    if (!schedule.enabled) return schedule;
    return this._createNextOccurrence(schedule);
  }

  // noinspection JSUnusedGlobalSymbols,JSMethodCanBeStatic
  /**
   * For now just returns a sha1sum of the schedule name
   * @param schedule
   * @returns {*}
   */
  _scheduleHash(schedule) {
    return sha1sum(schedule.name);
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
