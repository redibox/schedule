--[[
   key 1 -> rdb:schedule:name|||versionHash:timestamp
   key 2 -> rdb:schedule:active
   key 3 -> rdb:schedule:stalling
   arg 1 -> occurrence lock time reduced - evict the locks faster as we know they've been run
   arg 2 -> schedule
   arg 3 -> schedule item key
]]

redis.call('lrem', KEYS[2], 0, ARGV[2]);
redis.call('srem', KEYS[3], ARGV[2]);
redis.call('expire', KEYS[1], tonumber(ARGV[1]))
