var EventEmitter = require('events').EventEmitter
var backoff = require('backoff')

module.exports =
function (createConnection) {
  return function (opts, onConnect) {
    onConnect = 'function' == typeof opts ? opts : onConnect
    opts = opts || {initialDelay: 1e3, maxDelay: 30e3}
    if(!onConnect)
      onConnect = opts.onConnect

    var emitter = new EventEmitter()
    emitter.connected = false
    emitter.reconnect = true

    if(onConnect)
      emitter.on('connect', onConnect)

    backoff = (backoff[opts.type] || backoff.fibonacci) (opts)

    backoff.on('backoff', function (n, d) {
      emitter.emit('backoff', n, d)
    })

    var args
    function attempt (n, delay) {
      if(!emitter.reconnect) return

      emitter.emit('reconnect', n, delay)
      var con = createConnection.apply(null, args)
      emitter._connection = con
      function onDisconnect () {

        emitter.connected = false
        con.removeListener('error', onDisconnect)
        con.removeListener('close', onDisconnect)
        con.removeListener('end'  , onDisconnect)

        //emit disconnect before checking reconnect, so user has a chance to decide not to.
        emitter.emit('disconnect', con)

        if(!emitter.reconnect) return
        backoff.backoff()
      }

      con.on('connect', function () {
        backoff.reset()
        emitter.connected = true
        emitter.emit('connect', con)
      }).on('error', onDisconnect)
        .on('close', onDisconnect)
        .on('end'  , onDisconnect)
    }

    emitter.connect =
    emitter.listen = function () {
      this.reconnect = true
      if(emitter.connected) return
      backoff.reset()
      backoff.on('ready', attempt)
      args = [].slice.call(arguments)
      attempt(0, 0)
      return emitter
    }

    emitter.disconnect = function () {
      this.reconnect = false
      if(!emitter.connected) return emitter
      
      else if(emitter._connection)
        emitter._connection.destroy()
      return emitter
    }

    return emitter
  }

}
