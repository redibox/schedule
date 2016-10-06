--[[
   key 1 -> rdb:schedule:waiting
   key 2 -> rdb:schedule:name|||versionHash:timestamp
   arg 1 -> next timestamp
   arg 2 -> occurrence lock time
   arg 3 -> schedule
]]

local lock = redis.call('get', KEYS[2])

if not lock then
  redis.call('set', KEYS[2], ARGV[3], 'EX', tonumber(ARGV[2]))
  return redis.call('zadd', KEYS[1], tonumber(ARGV[1]), ARGV[3]);
else
  return lock;
end
