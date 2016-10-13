const { assert } = require('chai');

const { parseScheduleTimes, dateToUnixTimestamp, dateFromUnixTimestamp } = require('./../../src/utils');

const minute = 60;
const fiveMinute = minute * 5;

describe('schedule parser', () => {
  it('Should accept interval as a human interval string and parse correctly', (done) => {
    const schedule = parseScheduleTimes({ interval: 'every 1 seconds' });
    assert.isObject(schedule.laterSchedule);
    assert.isArray(schedule.laterSchedule.schedules);
    assert.isObject(schedule.laterSchedule.schedules[0]);
    assert.isArray(schedule.laterSchedule.schedules[0].s);
    assert.equal(schedule.laterSchedule.schedules[0].s.length, 60);
    done();
  });

  it('Should accept interval as a cron string and parse correctly', (done) => {
    const schedule = parseScheduleTimes({ interval: '* * * * * *' }); // every second
    assert.isObject(schedule.laterSchedule);
    assert.isArray(schedule.laterSchedule.schedules);
    assert.isObject(schedule.laterSchedule.schedules[0]);
    assert.isArray(schedule.laterSchedule.schedules[0].s);
    assert.equal(schedule.laterSchedule.schedules[0].s.length, 60);
    done();
  });

  it('Should return an error if failed to parse interval string', (done) => {
    const schedule = parseScheduleTimes({ interval: 'ew*gergerherned 4r eand' });
    assert.equal(schedule instanceof Error, true);
    assert.equal(schedule.message, 'Invalid schedule provided.');
    done();
  });

  it('Should return an error if invalid interval type provided', (done) => {
    const schedule = parseScheduleTimes({ interval: true });
    assert.equal(schedule instanceof Error, true);
    assert.equal(schedule.message, 'Invalid interval attribute provided.');
    done();
  });

  it('Should error if interval timestamp is in the past (for single run jobs)', (done) => {
    const inFive = (dateToUnixTimestamp() - fiveMinute) - 1;
    const schedule = parseScheduleTimes({ interval: inFive });
    assert.equal(schedule instanceof Error, true);
    done();
  });

  /** ********
   *  STARTS
   ******* **/

  it('Should correctly parse a human interval start string', (done) => {
    const inFive = (dateToUnixTimestamp() + fiveMinute) - 1;
    const schedule = parseScheduleTimes({ interval: 'every 1 minute', starts: 'in 5 minutes' });
    assert.isObject(schedule.laterSchedule);
    assert.isArray(schedule.laterSchedule.schedules);
    assert.isObject(schedule.laterSchedule.schedules[0]);
    assert.isArray(schedule.laterSchedule.schedules[0].m);
    assert.equal(schedule.laterSchedule.schedules[0].m.length, 60);

    // now check starts prop
    assert.isNumber(schedule.starts, 'starts property is not a valid timestamp');
    assert.approximately(schedule.starts, inFive, 1);
    done();
  });

  it('Should correctly parse a interval provided as a timestamp (for single run jobs)', (done) => {
    const inFive = (dateToUnixTimestamp() + fiveMinute) - 1;
    const schedule = parseScheduleTimes({ interval: inFive });
    assert.isUndefined(schedule.laterSchedule);
    assert.isBoolean(schedule.once);
    assert.equal(schedule.starts, inFive);
    assert.equal(schedule.next, inFive);
    assert.isString(schedule.endHuman);
    assert.isString(schedule.startHuman);
    assert.isString(schedule.nextHuman);

    // now check starts prop
    assert.isNumber(schedule.starts, 'starts property is not a valid timestamp');
    assert.equal(schedule.starts, inFive);
    done();
  });

  it('Should default to now if no starts property provided', (done) => {
    const now = dateToUnixTimestamp();
    const schedule = parseScheduleTimes({ interval: 'every 1 seconds' });
    assert.approximately(schedule.next, now, 1);
    assert.isString(schedule.endHuman);
    assert.isString(schedule.startHuman);
    assert.isString(schedule.nextHuman);

    // now check starts prop
    assert.isNumber(schedule.starts, 'starts property is not a valid timestamp');
    assert.approximately(schedule.starts, now, 1);
    done();
  });

  it('Should error if unable to parse a date from the starts string', (done) => {
    const schedule = parseScheduleTimes({ interval: 'every 5 seconds', starts: 'wehrnsfhb' });
    assert.equal(schedule instanceof Error, true);
    done();
  });

  it('Should correctly parse a human interval start string', (done) => {
    const inFive = (dateToUnixTimestamp() + fiveMinute) - 1;
    const schedule = parseScheduleTimes({ interval: 'every 1 minute', starts: 'in 5 minutes' });
    assert.isObject(schedule.laterSchedule);
    assert.isArray(schedule.laterSchedule.schedules);
    assert.isObject(schedule.laterSchedule.schedules[0]);
    assert.isArray(schedule.laterSchedule.schedules[0].m);
    assert.equal(schedule.laterSchedule.schedules[0].m.length, 60);

    // now check starts prop
    assert.isNumber(schedule.starts, 'starts property is not a valid timestamp');
    assert.equal(schedule.starts, inFive);
    done();
  });

  it('Should accept a timestamp for starts property', (done) => {
    const inFive = (dateToUnixTimestamp() + fiveMinute) - 1;
    const schedule = parseScheduleTimes({ interval: 'every 1 minute', starts: inFive });
    assert.isObject(schedule.laterSchedule);
    assert.isArray(schedule.laterSchedule.schedules);
    assert.isObject(schedule.laterSchedule.schedules[0]);
    assert.isArray(schedule.laterSchedule.schedules[0].m);
    assert.equal(schedule.laterSchedule.schedules[0].m.length, 60);

    // now check starts prop
    assert.isNumber(schedule.starts, 'starts property is not a valid timestamp');
    assert.equal(schedule.starts, inFive);
    done();
  });

  it('Should accept a js Date object for the starts property', (done) => {
    const inFive = (dateToUnixTimestamp() + fiveMinute) - 1;
    const startDate = dateFromUnixTimestamp(inFive);
    const schedule = parseScheduleTimes({ interval: 'every 1 minute', starts: startDate });
    assert.isObject(schedule.laterSchedule);
    assert.isArray(schedule.laterSchedule.schedules);
    assert.isObject(schedule.laterSchedule.schedules[0]);
    assert.isArray(schedule.laterSchedule.schedules[0].m);
    assert.equal(schedule.laterSchedule.schedules[0].m.length, 60);

    // now check starts prop
    assert.isNumber(schedule.starts, 'starts property is not a valid timestamp');
    assert.equal(schedule.starts, inFive);
    done();
  });

  /** ********
   *  ENDS
   ******* **/

  it('Should error if unable to parse a date from the ends string', (done) => {
    const schedule = parseScheduleTimes({ interval: 'every 5 seconds', ends: 'wehrnsfhb' });
    assert.equal(schedule instanceof Error, true);
    done();
  });

  it('Should correctly parse a human interval end string', (done) => {
    const inFive = (dateToUnixTimestamp() + fiveMinute) - 1;
    const schedule = parseScheduleTimes({ interval: 'every 1 minute', ends: 'in 5 minutes' });
    assert.isObject(schedule.laterSchedule);
    assert.isArray(schedule.laterSchedule.schedules);
    assert.isObject(schedule.laterSchedule.schedules[0]);
    assert.isArray(schedule.laterSchedule.schedules[0].m);
    assert.equal(schedule.laterSchedule.schedules[0].m.length, 60);

    // now check starts prop
    assert.isNumber(schedule.ends, 'ends property is not a valid timestamp');
    assert.approximately(schedule.ends, inFive, 1);
    done();
  });

  it('Should accept a timestamp for ends property', (done) => {
    const inFive = (dateToUnixTimestamp() + fiveMinute) - 1;
    const schedule = parseScheduleTimes({ interval: 'every 1 minute', ends: inFive });
    assert.isObject(schedule.laterSchedule);
    assert.isArray(schedule.laterSchedule.schedules);
    assert.isObject(schedule.laterSchedule.schedules[0]);
    assert.isArray(schedule.laterSchedule.schedules[0].m);
    assert.equal(schedule.laterSchedule.schedules[0].m.length, 60);

    // now check ends prop
    assert.isNumber(schedule.ends, 'ends property is not a valid timestamp');
    assert.equal(schedule.ends, inFive);
    done();
  });

  it('Should accept a js Date object for the ends property', (done) => {
    const inFive = (dateToUnixTimestamp() + fiveMinute) - 1;
    const endDate = dateFromUnixTimestamp(inFive);
    const schedule = parseScheduleTimes({ interval: 'every 1 minute', ends: endDate });
    assert.isObject(schedule.laterSchedule);
    assert.isArray(schedule.laterSchedule.schedules);
    assert.isObject(schedule.laterSchedule.schedules[0]);
    assert.isArray(schedule.laterSchedule.schedules[0].m);
    assert.equal(schedule.laterSchedule.schedules[0].m.length, 60);

    // now check ends prop
    assert.isNumber(schedule.ends, 'ends property is not a valid timestamp');
    assert.equal(schedule.ends, inFive);
    done();
  });

  /** ********
   *  TIMES
   ******* **/

  it('Should allow specifying the number of times a job should run', (done) => {
    const schedule = parseScheduleTimes({ interval: 'every 1 minute', times: 5 });
    assert.isObject(schedule.laterSchedule);
    assert.isArray(schedule.laterSchedule.schedules);
    assert.isObject(schedule.laterSchedule.schedules[0]);
    assert.isArray(schedule.laterSchedule.schedules[0].m);
    assert.equal(schedule.laterSchedule.schedules[0].m.length, 60);

    // now check ends prop
    assert.isNumber(schedule.ends, 'ends property is not a valid timestamp');
    assert.approximately(schedule.ends, schedule.next + (60 * 4), 1);
    done();
  });

  it('Should return an error if there\'s no more times available', (done) => {
    const fiveAgo = (dateToUnixTimestamp() - fiveMinute) - 1;
    const schedule = parseScheduleTimes({
      interval: 'every 1 minute',
      times: 3,
      starts: fiveAgo,
      forwardDatesOnly: true,
    });
    assert.equal(schedule instanceof Error, true);
    done();
  });
});
