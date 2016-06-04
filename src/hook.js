import later from 'later';
import defaults from './defaults';
import { BaseHook, deepGet, getTimeStamp } from 'redibox';

export default class Scheduler extends BaseHook {
  constructor() {
    super('schedule');
  }

  /**
   *
   * @returns {Promise.<T>}
   */
  initialize() {
    if (!this.options.schedules || !this.options.schedules.length) {
      return Promise.resolve();
    }

    for (let i = 0, len = this.options.schedules.length; i < len; i++) {
      const schedule = this.options.schedules[i];
      this.options.laterSchedules[i] = later.parse.text(schedule.interval);
      this.options.laterTimers[i] = later.setInterval(
        this.scheduleWrapper.bind(this, i),
        this.options.laterSchedules[i]
      );
    }

    return Promise.resolve();
  }

  /**
   *
   * @param i
   */
  scheduleWrapper(i) {
    const schedule = this.options.schedules[i];

    // 'multi' skips 'single instance only' run checks across servers
    // useful for jobs you want to run on every server not just once per cluster per X time
    if (schedule.multi) return this.execSchedule(schedule);

    return this // very crude lock - TODO redlock this
      .client
      .set(this.core.toKey(`schedules:${i}`), i, 'NX', 'EX', this.options.minInterval)
      .then(res => {
        if (!res) return Promise.resolve();
        return this.execSchedule(schedule);
      });
  }

  /**
   *
   * @param schedule
   * @returns {Promise}
   */
  execSchedule(schedule) {
    if (!schedule.runs) throw new Error('Schedule is missing a runs parameter.');
    const runner = deepGet(global, schedule.runs);
    return runner(schedule)
      .then(this.successLogger.bind(this, schedule))
      .catch(this.errorLogger.bind(this, schedule));
  }

  /**
   *
   * @param schedule
   */
  successLogger(schedule) {
    this.log.info(`${getTimeStamp()}: Schedule for '${schedule.runs}' ${schedule.data ? JSON.stringify(schedule.data) : null} has completed successfully.`);
  }

  /**
   *
   * @param schedule
   * @param error
   */
  errorLogger(schedule, error) {
    this.log.error(`${getTimeStamp()}: Schedule for '${schedule.runs}' ${schedule.data ? JSON.stringify(schedule.data) : null} has failed to complete.`);
    this.log.error(error);
  }

  // noinspection JSUnusedGlobalSymbols,JSMethodCanBeStatic
  /**
   * Default config for scheduler
   * @returns {{someDefaultThing: string}}
   */
  defaults() {
    return defaults;
  }

}
