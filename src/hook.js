import later from 'later';
import defaults from './defaults';
import { BaseHook } from 'redibox';

export default class Scheduler extends BaseHook {
  constructor() {
    super('scheduler');
  }

  initialize() {
    for (let i = 0, len = this.options.schedules.length; i < len; i++) {
      const schedule = this.options.schedules[i];

      this.options.schedules[i] = later.parse.text(schedule);
    }
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
