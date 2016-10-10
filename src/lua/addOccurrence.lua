--[[
   key 1 -> rdb:schedule:waiting
   key 2 -> rdb:schedule:name|||versionHash:timestamp
   key 3 -> rdb:schedule:schedules - hash
   arg 1 -> next timestamp
   arg 2 -> next time - human readable
   arg 3 -> occurrence lock time
   arg 4 -> schedule
   arg 5 -> schedule name
]]

local lock = redis.call('get', KEYS[2])

if not lock then
  local schedule = redis.call('hget', KEYS[3], ARGV[5])
  if not schedule then return nil end

  -- create a lock for this occurrence then add to sorted set
  redis.call('set', KEYS[2], ARGV[4], 'EX', tonumber(ARGV[3]))
  redis.call('zadd', KEYS[1], tonumber(ARGV[1]), ARGV[4]);

  -- update schedule next times
  local scheduleParsed = cjson.decode(schedule)
  scheduleParsed.occurrence.next = tonumber(ARGV[1])
  scheduleParsed.occurrence.nextHuman = tonumber(ARGV[2])

  -- re-encode json and update hash
  redis.call('hset', KEYS[3], ARGV[5], cjson.encode(scheduleParsed))
else
  return lock;
end
