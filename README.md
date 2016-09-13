[![Coverage Status](https://coveralls.io/repos/github/redibox/schedule/badge.svg?branch=master)](https://coveralls.io/github/redibox/schedule?branch=master)
![Downloads](https://img.shields.io/npm/dt/redibox-hook-schedule.svg)
[![npm version](https://img.shields.io/npm/v/redibox-hook-schedule.svg)](https://www.npmjs.com/package/redibox-hook-schedule)
[![dependencies](https://img.shields.io/david/redibox/schedule.svg)](https://david-dm.org/redibox/schedule)
[![build](https://travis-ci.org/redibox/schedule.svg)](https://travis-ci.org/redibox/schedule)
[![License](https://img.shields.io/npm/l/redibox-hook-schedule.svg)](/LICENSE)

## RediBox Schedule

Allows functions to run at set times, taking into consideration multi-server environments for hassle free scheduling.

### Installation

First ensure you have [RediBox](https://github.com/redibox/core) installed.

Install Schedule via npm:

`npm install redibox-hook-schedule --save`

### Usage

#### Configure schedules

Within your `redibox` config, we'll setup a new `schedule` object containing a `schedules` array. Each array item consists of a `runs` function, `data` and an `interval`.

- **runs**: A function or string (a globally available function as a dot notated string i.e. some.fooBar function which would resolve to global.some.fooBar automatically).
- **data**: Any data to use when calling this schedule.
- **interval**: A string of the interval time, compatible with (Later.js)(https://bunkat.github.io/later/parsers.html#text).

```
{
  schedule: {
    schedules: [
      runs: function(schedule) {
        // do something every 5 minutes
        console.log('The value of foo is: ' + schedule.data.foo);
      },
      data: {
        foo: 'bar',
      },
      interval: 'every 5 minutes',
    ],
  },
}
```

#### Accessing schedule data

If passing in a function directly (like above), the schedule is available to the `runs` function as the first argument, where the data can be accessed via `schedule.data`.

### Multi-server environments

Typically a large application will deploy many servers running the same code base. As expected the schedule will run on each individual server. If you have 20 servers deployed, and a schedule runs every minute to query an external API then update your database, you don't want 20 servers doing this at once.

Luckily, by default only a single server can only run a schedule at any one time. This is handled by utilising Redis locks. Once a schedule is picked up by a server, it is locked on Redis and cannot be run again until it is unlocked (which is performed automatically).

There might be however use cases where running a scheduled task across all servers is required. In this case, simply set the `multi` option to `true` on the schedule object.
