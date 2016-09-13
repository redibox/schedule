[![Coverage Status](https://coveralls.io/repos/github/redibox/schedule/badge.svg?branch=master)](https://coveralls.io/github/redibox/schedule?branch=master)
![Downloads](https://img.shields.io/npm/dt/redibox-hook-cache.svg)
[![npm version](https://img.shields.io/npm/v/redibox-hook-cache.svg)](https://www.npmjs.com/package/redibox-hook-schedule)
[![dependencies](https://img.shields.io/david/redibox/schedule.svg)](https://david-dm.org/redibox/schedule)
[![build](https://travis-ci.org/redibox/schedule.svg)](https://travis-ci.org/redibox/schedule)
[![License](https://img.shields.io/npm/l/redibox-hook-cache.svg)](/LICENSE)

## RediBox Schedule

Allows functions to run at set times, taking into consideration multi-server environments for hassle free scheduling.

### Installation

First ensure you have [RediBox](https://github.com/redibox/core) install.

Install Memset via npm: 

`npm install redibox-hook-schedule --save`

### Usage

#### Configure schedules

Within your `redibox` config, we'll setup a new `schedule` object containing a `schedules` array. Each set item consists of a `runs` function, `data` and an `interval`.

- **runs**: A function or string (which returns a function).
- **data**: A Primitive value or Object/Array.
- **interval**: A string of the interval time, compatible with (Later)(https://bunkat.github.io/later/parsers.html#text).

```
{
  schedule: {
    schedules: [
      runs: function(scheule) {
        // Do something every 5 minutes
        console.log('The value of foo is: ' + scheule.data.foo);
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

If passing in a function directly (like above), the schedule is bound to the `runs` function as the first argument, where the data can be access via `schedule.data`.

If the value of `runs` is a globally accessible function, the schdule is bound to the function directly (as `this`). For example:

```
...
runs: 'global.someDirectory.someFile',
data: {
  foo: 'bar',
},
...
```

```
// global.someDirectory.someFile
export default function() {
 console.log('The value of foo is: ' + this.data.foo);
}
```
