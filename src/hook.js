const Promise = require('bluebird');
const { BaseHook, deepGet, getTimeStamp, isFunction, sha1sum, tryJSONStringify, tryJSONParse } = require('redibox');

const scripts = require('./scripts');
const defaults = require('./defaults');
const { parseScheduleTimes, microTime } = require('./utils');

class Scheduler extends BaseHook {
  constructor() {
    super('schedule');

    this.lastTick = null;
    this.lastTickTimeTaken = null;
    this.state = 'stopped';
    this.processTimer = null;
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
    this._beginWorking();
    if (this.options.schedules && this.options.schedules.length) {
      const promises = [];
      for (let i = 0, len = this.options.schedules.length; i < len; i++) {
        promises.push(this.createOrUpdate(this.options.schedules[i], true));
      }

      return Promise.all(promises);
    }

    return Promise.resolve();
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
      return this.client.zadd(
        this._toKey('waiting'),
        schedule.occurrence.next,
        `${schedule.name}|||${schedule.versionHash}`
      );
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

  update(schedule, existing, occurrence) {
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
    schedule.versionHash = this._createOccurrenceHash(schedule);
    schedule.occurrence = validation;
    schedule.timesRan = 0;
    schedule.lastRan = 0;
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
    return sha1sum('' + schedule.name + schedule.interval + schedule.starts + schedule.ends);
  }

  _beginWorking() {
    if (this.options.enabled && !this.processTimer) {
      this.log.verbose('Begin Working');
      this.processTimer = setTimeout(this._doWork.bind(this), this.options.processInterval);
      this.state = 'active';
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
      Date.now(),
      this.options.processIntervalLock,
      this.core.id, // use the the worker id as the lock hash
      this.options.processInterval,
      (error, result) => {
        if (error) {
          this.log.error(error);
        }
        if (typeof result === 'string') {
          this.log.debug(`Work script ran but was already locked by worker '${result}'.`);
        } else {
          this.lastTickTimeTaken = (microTime() - this.lastTick).toFixed(2);
          this.log.debug(`Work script ran and moved ${result} occurrences in ${this.lastTickTimeTaken}ms.`);
        }
        this.processTimer = setTimeout(this._doWork.bind(this), this.options.processInterval);
      }
    );
  }

  /**
   *
   * @param schedule
   * @returns {Promise}
   */
  _execSchedule(schedule) {
    if (!schedule.runs) throw new Error(`Schedule is missing a runs parameter - ${JSON.stringify(schedule)}`);
    const runner = typeof schedule.runs === 'string' ? deepGet(global, schedule.runs) : schedule.runs;

    if (!isFunction(runner)) {
      return this.log.error(`Schedule invalid, expected a function or a global string dot notated path to a function - ${JSON.stringify(schedule)}`);
    }

    const possiblePromise = runner(schedule);

    if (!possiblePromise.then) {
      if (possiblePromise && possiblePromise.stack) return this.errorLogger(possiblePromise, schedule);
      return this.successLogger(schedule);
    }

    return possiblePromise
      .then(this.successLogger.bind(this, schedule))
      .catch(this.errorLogger.bind(this, schedule));
  }

  /**
   *
   * @param schedule
   */
  _successLogger(schedule) {
    this.log.info(`${getTimeStamp()}: Schedule for '${schedule.runs}' ${schedule.data ? JSON.stringify(schedule.data) : ''} has completed successfully.`);
  }

  /**
   *
   * @param schedule
   * @param error
   */
  _errorLogger(schedule, error) {
    this.log.error(`${getTimeStamp()}: Schedule for '${schedule.runs}' ${schedule.data ? JSON.stringify(schedule.data) : ''} has failed to complete.`);
    this.log.error(error);
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
