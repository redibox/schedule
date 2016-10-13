const { assert } = require('chai');

const { parseScheduleTimes, dateToUnixTimestamp, dateFromUnixTimestamp } = require('./../../src/utils');


describe('schedule runner', () => {
  it('Should reject a schedule if no name property specified', function (done) {
    const schedule = {
      runs: 'testyTestStartEnds',
      interval: 'every 1 seconds',
      ends: 'in 4 seconds',
    };

    Hook.createOrUpdate(schedule).then(() => {
      done('Schedule should have rejected.');
    }).catch((error) => {
      assert.instanceOf(error, Error);
      assert.equal(error.message, 'Missing schedule name.');
      done();
    });
  });

  it('Should reject a schedule if no runs property specified', function (done) {
    const schedule = {
      name: 'testyTestStartEnds',
      interval: 'every 1 seconds',
      ends: 'in 4 seconds',
    };

    Hook.createOrUpdate(schedule).then(() => {
      done('Schedule should have rejected.');
    }).catch((error) => {
      assert.instanceOf(error, Error);
      assert.equal(error.message, 'Missing schedule \'runs\' property.');
      done();
    });
  });

  it('Should reject a schedule if no interval property specified', function (done) {
    const schedule = {
      name: 'testyTestStartEnds',
      runs: 'potato',
    };

    Hook.createOrUpdate(schedule).then(() => {
      done('Schedule should have rejected.');
    }).catch((error) => {
      assert.instanceOf(error, Error);
      assert.equal(error.message, 'Missing schedule \'interval\' property.');
      done();
    });
  });

  it('Should run repeat schedules with an interval', function (done) {
    this.timeout(6000);
    this.slow(3000);
    let count = 0;
    const schedule = {
      name: 'every1second',
      runs: 'testyTest',
      interval: 'every 1 seconds',
      data: {
        foo: 'bar',
      },
      // times: 3,
    };
    global.testyTest = (sched) => {
      assert.isObject(sched);
      assert.isObject(sched.data);
      assert.isString(sched.data.foo);
      assert.equal(sched.name, schedule.name);
      count += 1;
      assert.equal(sched.timesRan, count);
      if (count === 2) {
        return Hook.destroy(schedule.name).then(() => done());
      }
      return Promise.resolve();
    };

    Hook.createOrUpdate(schedule).then((created) => {
      assert.isObject(created);
      assert.equal(created.name, schedule.name);
      assert.isObject(created.occurrence);
      assert.isObject(created.data);
    });
  });

  it('Should run a schedule once at a specified timestamp', function (done) {
    this.timeout(5000);
    this.slow(5000);
    const when = dateToUnixTimestamp() + 2;
    const schedule = {
      name: 'onceIn2Secs',
      runs: 'testyTestOnce',
      interval: when,
    };

    global.testyTestOnce = (sched) => {
      assert.isObject(sched);
      assert.isObject(sched.occurrence);
      assert.equal(sched.occurrence.onceCompleted, true);
      assert.equal(sched.name, schedule.name);
      assert.equal(sched.timesRan, 1);
      assert.equal(when, dateToUnixTimestamp());
      return Hook.destroy(schedule.name).then(() => done());
    };

    Hook.createOrUpdate(schedule).then((created) => {
      assert.isObject(created);
      assert.equal(created.name, schedule.name);
      assert.isObject(created.occurrence);
    });
  });

  it('Should run a schedule with an interval for a specific amount of times', function (done) {
    this.timeout(6000);
    this.slow(5000);
    let count = 0;
    const schedule = {
      name: 'every1second',
      runs: 'testyTestTimes',
      interval: 'every 1 seconds',
      times: 2,
    };

    global.testyTestTimes = (sched) => {
      assert.isObject(sched);
      assert.equal(sched.name, schedule.name);
      count += 1;
      assert.equal(sched.timesRan, count);
      if (count === 2) {
        setTimeout(() => Hook.destroy(schedule.name).then(() => done()), 1200);
      }
      if (count === 3) {
        return done('Times test failed, test ran more than the specified number of times.');
      }
      return Promise.resolve();
    };

    Hook.createOrUpdate(schedule).then((created) => {
      assert.isObject(created);
      assert.equal(created.name, schedule.name);
      assert.isObject(created.occurrence);
    });
  });

  it('Should run a schedule with an interval ending at a specific time', function (done) {
    this.timeout(7000);
    this.slow(7000);
    let count = 0;
    const schedule = {
      name: 'every1second',
      runs: 'testyTestEnds',
      interval: 'every 1 seconds',
      ends: 'in 3 seconds',
    };

    global.testyTestEnds = (sched) => {
      assert.isObject(sched);
      assert.equal(sched.name, schedule.name);
      count += 1;
      assert.equal(sched.timesRan, count);
      if (count === 3) {
        setTimeout(() => Hook.destroy(schedule.name).then(() => done()), 1500);
      }
      if (count === 4) {
        return done('Times test failed, test ran more than the specified number of times.');
      }
      return Promise.resolve();
    };

    Hook.createOrUpdate(schedule).then((created) => {
      assert.isObject(created);
      assert.equal(created.name, schedule.name);
      assert.isObject(created.occurrence);
    });
  });

  it('Should run a schedule with start and end times specified', function (done) {
    this.timeout(10000);
    this.slow(9000);
    let count = 0;
    const schedule = {
      name: 'every1second',
      runs: 'testyTestStartEnds',
      interval: 'every 1 seconds',
      ends: 'in 4 seconds',
      starts: dateToUnixTimestamp() + 2,
    };
    const now = Date.now();

    global.testyTestStartEnds = (sched) => {
      const timeTaken = Date.now() - now;
      assert.approximately(timeTaken, 2000, 1000);
      assert.isObject(sched);
      assert.equal(sched.name, schedule.name);
      count += 1;
      assert.equal(sched.timesRan, count);
      if (count === 2) {
        setTimeout(() => Hook.destroy(schedule.name).then(() => done()), 1500);
      }
      if (count === 3) {
        return done('Times test failed, test ran more than the specified number of times.');
      }
      return Promise.resolve();
    };

    Hook.createOrUpdate(schedule).then((created) => {
      assert.isObject(created);
      assert.equal(created.name, schedule.name);
      assert.isObject(created.occurrence);
    });
  });
});
