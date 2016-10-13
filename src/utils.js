const later = require('later');
const chrono = require('chrono-node');
const { getTimeStamp } = require('redibox');

const { readFileSync } = require('fs');
const { resolve } = require('path');

const containsAlphaCharsRegex = /[a-z:]/i;

/**
 *
 * @param timestamp
 * @returns {boolean}
 */
// TODO timestamp validation on input
// function isValidTimestamp(timestamp) {
//   return (new Date(timestamp)).getTime() > 0;
// }

/**
 * Returns a timestamp in seconds
 * Cached for performance - per 500ms or 1000 calls.
 * @returns {number}
 */
let _timestamp;
// eslint-disable-next-line
var _ncalls = 0; // let compound assignment is de-opt in v8 currently.
function getUnixTimestamp() {
  // eslint-disable-next-line
  if (!_timestamp || ++_ncalls > 1000) {
    _timestamp = Math.ceil(getTimeStamp() / 1000);
    _ncalls = 0;
    setTimeout(() => {
      _timestamp = null;
    }, 500);
  }
  return _timestamp;
}

/**
 *
 * @returns {number}
 */
function microTime() {
  const hrTime = process.hrtime();
  return ((hrTime[0] * 1000000) + (hrTime[1] / 1000)) / 1000;
}

/**
 * Converts a JS date to a unix timestamp
 * @param date
 * @returns {number}
 */
function dateToUnixTimestamp(date) {
  const _date = date || new Date();
  return Math.ceil(_date.getTime() / 1000);
}

/**
 * Converts a unix timestamp to a JS date object
 * @param ts
 * @returns {Date}
 */
function dateFromUnixTimestamp(ts) {
  return new Date(ts * 1000);
}

/**
 * Schedule parser - calculates start and end times as well as interval
 * @returns {*}
 * @param scheduleOptions
 */
function parseScheduleTimes(scheduleOptions) {
  const _times = scheduleOptions.times;
  const interval = scheduleOptions.interval;

  let schedule = null;
  let _start = scheduleOptions.starts;
  let _end = scheduleOptions.ends || false;

  const now = getUnixTimestamp();

  // test if the interval string is a cron string
  // non cron strings contain alpha chars.
  if (typeof interval === 'string') {
    if (containsAlphaCharsRegex.test(interval)) {
      schedule = later.parse.text(interval);
    } else {
      // second part is a boolean whether the cron has as seconds or not
      // 6 spaces means there's an additional cron part which is likely seconds
      schedule = later.parse.cron(interval, interval.trim().split(' ').length === 6);
    }

    // check interval was parsed successfully using later js
    if (Object.hasOwnProperty.call(schedule, 'error') && schedule.error !== -1) {
      return new Error('Invalid schedule provided.');
    }

    // parse the start date
    if (_start && typeof _start === 'string') {
      // user provided a human date string
      const startDate = chrono.parse(_start, null, { forwardDatesOnly: scheduleOptions.forwardDatesOnly });
      if (startDate.length && startDate[0].start) _start = dateToUnixTimestamp(startDate[0].start.date());
      else return new Error(`Error parsing 'starting from' value of '${_start}'. Did you forget to use a keyword such as 'in'?`);
    } else if (_start && Object.prototype.toString.call(_start) === '[object Date]') {
      // user provided a date - convert it to a timestamp
      _start = dateToUnixTimestamp(_start);
    } else if (typeof _start !== 'number') {
      // no start date and it's not a number - use the current date as a starting point
      _start = getUnixTimestamp();
    }

    // parse then end date
    if (_end && typeof _end === 'string') {
      // user provided a human date string
      const endDate = chrono.parse(_end, null, { forwardDatesOnly: scheduleOptions.forwardDatesOnly });
      if (endDate.length && endDate[0].start) _end = dateToUnixTimestamp(endDate[0].start.date());
      else return new Error(`Error parsing 'until' value of '${_end}'. Did you forget to use a keyword such as 'in'?`);
    } else if (_end && Object.prototype.toString.call(_end) === '[object Date]') {
      _end = dateToUnixTimestamp(_end); // user provided a date - convert it to a timestamp
    }

    // if no ends prop was specified but we have 'times' then calculate the date
    // of the last occurrence
    if (!scheduleOptions.ends && _times) {
      const startDate = dateFromUnixTimestamp(_start - 1);
      // add an additional time in case later returns the current timestamp as the first occurrence
      const nextTimes = later.schedule(schedule).next(_times + 1, startDate);
      if (nextTimes && nextTimes[0].getTime() === startDate.getTime()) {
        // remove the current time as as the first occurrence
        nextTimes.shift();
      } else {
        // remove the unnecessary occurrence
        nextTimes.pop();
      }
      if (!nextTimes) {
        return new Error(
          'Error getting occurrences based on number of times, no occurrences were returned for the number of times specified with the current date criteria.'
        );
      }
      _end = dateToUnixTimestamp(nextTimes[nextTimes.length - 1]);
    }

    if (scheduleOptions.forwardDatesOnly) {
      // if the start date is in the past then default to now
      if (_start < now) _start = now;
      // if the end date is in the past then default to now
      if (_end && _end < now) return new Error('The schedule you specified ends in the past and cannot be processed with "forwardDatesOnly" option enabled.');
    }
  } else if (typeof interval === 'number') {
    if (interval <= now) return new Error(`Unix timestamp interval provided must not be in the past - you provided an interval of '${interval}'`);
    return {
      once: true,
      onceCompleted: false,
      next: interval,
      ends: interval + 1,
      starts: interval,
      intervalInput: interval,
      endHuman: dateFromUnixTimestamp(interval).toISOString(),
      startHuman: dateFromUnixTimestamp(interval).toISOString(),
      nextHuman: dateFromUnixTimestamp(interval).toISOString(),
    };
  } else {
    return new Error('Invalid interval attribute provided.');
  }

  // get the next interval occurrence
  // we need to get next 2 occurrences as later counts the current time as valid in most cases
  const startDate = dateFromUnixTimestamp(_start - 1);
  let next = later.schedule(schedule).next(2, startDate, _end ? dateFromUnixTimestamp(_end) : null);
  if (next && next[0].getTime() === startDate.getTime()) next.shift();
  if (!next || !next.length) return new Error('No more occurrences possible, are the start and end strings correct?');
  next = next[0];

  return {
    laterSchedule: schedule,
    ends: _end || 999999999999,
    endInput: scheduleOptions.ends || false,
    starts: _start,
    startInput: scheduleOptions.starts || false,
    intervalInput: interval,
    next: dateToUnixTimestamp(next),
    endHuman: _end ? dateFromUnixTimestamp(_end).toISOString() : 'No End Date',
    startHuman: dateFromUnixTimestamp(_start).toISOString(),
    nextHuman: next.toISOString(),
    times: _times || -1,
  };
}

/**
 * Loads a named lua script from the lua directory.
 * @param script script name
 */
function loadLuaScript(script) {
  try {
    return readFileSync(resolve(__dirname, `./lua/${script}.lua`)).toString();
  } catch (e) {
    return '';
  }
}

/**
 *
 * @param min
 * @param max
 * @returns {number}
 */
function randomInt(min, max) {
  return Math.floor((Math.random() * ((max - min) + 1)) + min);
}


/**
 * Class to help with exponential retry generation.
 */
class ExponentialRetries {
  constructor() {
    this.instances = {};
  }

  /**
   * Create a tag.
   * @param tag
   * @param delay
   * @param max
   * @param jitter
   */
  create(tag, delay, max = 10, jitter) {
    this.instances[tag] = {
      max,
      delay,
      jitter: jitter ? delay * jitter : 0,
      current: 1,
    };
  }

  /**
   * Get the next delay period for a tag.
   * @param tag
   * @returns {*}
   */
  getDelay(tag) {
    const instance = this.instances[tag];
    if (!instance) return null;
    if (instance.current < instance.max) {
      this.instances[tag].current += 1;
    }

    const prev = instance.delay * (instance.current - 2) || 0;
    let next = instance.delay * (instance.current - 1);

    // random between previous and next if a jitter % was provided.
    if (prev > 0 && instance.jitter > 0) {
      next = randomInt(prev + instance.jitter, next + instance.jitter);
    }

    return next;
  }

  /**
   * Reset a tag back to its original values.
   * @param tag
   */
  reset(tag) {
    if (this.instances[tag]) this.instances[tag].current = 1;
  }
}

module.exports.getUnixTimestamp = getUnixTimestamp;
module.exports.microTime = microTime;
module.exports.dateToUnixTimestamp = dateToUnixTimestamp;
module.exports.dateFromUnixTimestamp = dateFromUnixTimestamp;
module.exports.parseScheduleTimes = parseScheduleTimes;
module.exports.loadLuaScript = loadLuaScript;
module.exports.ExponentialRetries = ExponentialRetries;
