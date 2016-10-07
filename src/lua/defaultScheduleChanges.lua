--[[
  key 1 -> rdb:schedule:defaults
  schedules
  names
]]

local schedules = cjson.decode(ARGV[1])
local defaults = redis.call('smembers', KEYS[1])

redis.call('del', KEYS[1] .. 'Temp')

for i, schedule in ipairs(schedules) do
  local name = schedule.name
  local versionHash = schedule.versionHash
  local inDefaults = redis.call('sismember', KEYS[1], name)
  local inDefaultsVersion = redis.call('sismember', KEYS[1] .. 'Version', name .. '|||' .. versionHash)

  if inDefaults then
    if inDefaultsVersion then
      schedule.type = 'same'
    else
      schedule.type = 'diff'
    end
  else
    schedule.type = 'new'
    redis.call('sadd', KEYS[1], name)
  end

  redis.call('sadd', KEYS[1] .. 'Temp', name .. '|||' .. versionHash)
end
