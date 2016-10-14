const { assert } = require('chai');

const { parseScheduleTimes, dateToUnixTimestamp, dateFromUnixTimestamp } = require('./../../src/utils');


describe('schedule runner', () => {
  it('Should reject a schedule if no name property specified', function (done) {
    const schedule = {
      runs: 'testyTestStartEnds',
      interval: 'every 1 seconds',
      ends: 'in 4 seconds',
    };

    this.test.hook.createOrUpdate(schedule).then(() => {
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

    this.test.hook.createOrUpdate(schedule).then(() => {
      done('Schedule should have rejected.');
    }).catch((error) => {
      assert.instanceOf(error, Error);
      assert.equal(error.message, 'Missing schedule \'runs\' string property.');
      done();
    });
  });

  it('Should reject a schedule if no interval property specified', function (done) {
    const schedule = {
      name: 'testyTestStartEnds',
      runs: 'potato',
    };

    this.test.hook.createOrUpdate(schedule).then(() => {
      done('Schedule should have rejected.');
    }).catch((error) => {
      assert.instanceOf(error, Error);
      assert.equal(error.message, 'Missing schedule \'interval\' property.');
      done();
    });
  });

  it('... Should run a schedule and allow synchronous rejections', function (done) {
    this.timeout(5000);
    this.slow(5000);
    const when = dateToUnixTimestamp() + 2;
    const schedule = {
      name: 'onceIn2Secs',
      runs: 'testyTestOnceWithError',
      interval: when,
    };

    this.test.hook.once('onScheduleFailure', (event) => {
      assert.isObject(event);
      assert.isObject(event.schedule);
      assert.instanceOf(event.error, Error);
      assert.isTrue(event.error.message.includes('Test'));
      assert.equal(event.schedule.name, schedule.name);
      this.test.hook.destroy(schedule.name).then(() => done());
    });

    global.testyTestOnceWithError = (sched) => {
      assert.isObject(sched);
      assert.isObject(sched.occurrence);
      assert.equal(sched.occurrence.onceCompleted, true);
      assert.equal(sched.name, schedule.name);
      assert.equal(sched.timesRan, 1);
      assert.equal(when, dateToUnixTimestamp());
      return new Error('Test');
    };

    this.test.hook.createOrUpdate(schedule).then((created) => {
      assert.isObject(created);
      assert.equal(created.name, schedule.name);
      assert.isObject(created.occurrence);
    });
  });

  it('... Should run repeat schedules with an interval', function (done) {
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
        return this.test.hook.destroy(schedule.name).then(() => done());
      }
      return Promise.resolve();
    };

    this.test.hook.createOrUpdate(schedule).then((created) => {
      assert.isObject(created);
      assert.equal(created.name, schedule.name);
      assert.isObject(created.occurrence);
      assert.isObject(created.data);
    });
  });

  it('... Should run a schedule once at a specified timestamp', function (done) {
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
      return this.test.hook.destroy(schedule.name).then(() => done());
    };

    this.test.hook.createOrUpdate(schedule).then((created) => {
      assert.isObject(created);
      assert.equal(created.name, schedule.name);
      assert.isObject(created.occurrence);
    });
  });

  it('... Should run a schedule with an interval for a specific amount of times', function (done) {
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
        setTimeout(() => this.test.hook.destroy(schedule.name).then(() => done()), 1200);
      }
      if (count === 3) {
        return done('Times test failed, test ran more than the specified number of times.');
      }
      return Promise.resolve();
    };

    this.test.hook.createOrUpdate(schedule).then((created) => {
      assert.isObject(created);
      assert.equal(created.name, schedule.name);
      assert.isObject(created.occurrence);
    });
  });

  it('... Should run a schedule with an interval ending at a specific time', function (done) {
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
        setTimeout(() => this.test.hook.destroy(schedule.name).then(() => done()), 2500);
      }
      if (count === 4) {
        return done('Times test failed, test ran more than the specified number of times.');
      }
      return Promise.resolve();
    };

    this.test.hook.createOrUpdate(schedule).then((created) => {
      assert.isObject(created);
      assert.equal(created.name, schedule.name);
      assert.isObject(created.occurrence);
    });
  });

  it('... Should run a schedule with start and end times specified', function (done) {
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
      assert.approximately(timeTaken, 2000, 1100);
      assert.isObject(sched);
      assert.equal(sched.name, schedule.name);
      count += 1;
      assert.equal(sched.timesRan, count);
      if (count === 2) {
        setTimeout(() => this.test.hook.destroy(schedule.name).then(() => done()), 1500);
      }
      if (count === 3) {
        return done('Times test failed, test ran more than the specified number of times.');
      }
      return Promise.resolve();
    };

    this.test.hook.createOrUpdate(schedule).then((created) => {
      assert.isObject(created);
      assert.equal(created.name, schedule.name);
      assert.isObject(created.occurrence);
    });
  });

  it('... Should create and run default schedules (even after a flush)', function (done) {
    this.timeout(6000);
    this.slow(4500);
    let count = 0;

    global.defaultScheduleRunner = (sched) => {
      assert.isObject(sched);
      assert.isTrue(sched.default);
      assert.equal(sched.name, 'everySecDefaultFunc');
      count += 1;
      if (count === 2) {
        done();
        return global.defaultScheduleRunner = null;
      }
      return Promise.resolve();
    };
  });

  it('... Should emit a multi pubsub message for multi schedules', function (done) {
    this.timeout(4000);
    this.slow(3000);
    const schedule = {
      name: 'every1second',
      runs: 'testyTestMultiEmit',
      interval: 'every 1 seconds',
      multi: true,
      times: 1,
    };

    this.test.hook.core.pubsub.subscribeOnce(this.test.hook.toEventName('runMultiJob'), (event) => {
      assert.isObject(event);
      assert.isObject(event.data);
      assert.equal(event.data.coreId, this.test.hook.core.id);
      assert.equal(event.data.name, schedule.name);
      this.test.hook.destroy(schedule.name).then(() => done());
    });

    global.testyTestMultiEmit = () => Promise.resolve();

    this.test.hook.createOrUpdate(schedule).then((created) => {
      assert.isObject(created);
      assert.equal(created.name, schedule.name);
      assert.isObject(created.occurrence);
    });
  });

  it('... Should not create occurrences for schedules that are created with enabled=false', function (done) {
    this.timeout(6000);
    this.slow(5000);
    let completed = false;

    const schedule = {
      name: 'every1second',
      runs: 'testDisabled',
      interval: 'every 1 seconds',
      enabled: false,
      times: 5,
    };


    global.testDisabled = () => {
      if (!completed) {
        completed = true;
        this.test.hook.destroy(schedule.name).then(() => done('Disabled schedule created an occurrence.'));
      }
    };

    this.test.hook.createOrUpdate(schedule).then((created) => {
      assert.isObject(created);
      assert.isFalse(created.enabled);
      assert.equal(created.name, schedule.name);
      assert.isObject(created.occurrence);
      setTimeout(() => {
        if (!completed) {
          completed = true;
          this.test.hook.destroy(schedule.name).then(() => done());
        }
      }, 1500);
    });
  });

  it('... Should fail schedule if resolved runs property is not a function', function (done) {
    this.timeout(4000);
    this.slow(3000);
    const schedule = {
      name: 'every1second',
      runs: 'nyannyan',
      interval: 'every 1 seconds',
      multi: true,
      times: 1,
    };

    global.nyannyan = 'cat';

    this.test.hook.once('onScheduleFailure', (event) => {
      assert.isObject(event);
      assert.isObject(event.schedule);
      assert.instanceOf(event.error, Error);
      assert.isTrue(event.error.message.includes('expected a function'));
      assert.equal(event.schedule.name, schedule.name);
      this.test.hook.destroy(schedule.name).then(() => done());
    });


    this.test.hook.createOrUpdate(schedule).then((created) => {
      assert.isObject(created);
      assert.equal(created.name, schedule.name);
      assert.isObject(created.occurrence);
    });
  });
});
