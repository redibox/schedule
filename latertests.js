const later = require('later');


const schedule = later.parse.text('at 5:00 am on Monday');
console.dir(schedule.schedules);
// setInterval(() => {
const date = new Date();
const next = later.schedule(schedule).next(2, date);
console.log('next 2', next);
const prev = later.schedule(schedule).prev(2, date);
console.log('previous 2', prev);
// }, 1000)
