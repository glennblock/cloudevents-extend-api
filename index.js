'use strict';

let instance;
var subscriptions = {};

var subscribe = (eventType, cb) => {
  subscriptions[eventType] = cb;
} 

module.exports = () => {
    return (req, res, next) => {
      return instance ? handleRequest() : compileHandler();
      
      function compileHandler() {
        req.webtaskContext.compiler.nodejsCompiler(req.webtaskContext.compiler.script, (e, Func) => {
          if (e) return next(e);
          
          instance = new Func();
          instance(subscribe);
          return handleRequest();
        });
      }
      
      function handleRequest() {
        let auth;
        if (req.webtaskContext.secrets.BASIC_AUTH) {
          auth = new Buffer(req.webtaskContext.secrets.BASIC_AUTH).toString('base64');
        }
        if (auth) {
          let match = (req.headers.authorization || '').match(/^\s*Basic\s+([^\s]+)\s*$/);
          if (!match || match[1] !== auth) {
            let error = new Error('Unauthorized.');
            error.statusCode = 403;
            return next(error);
          }
        }
        let eventType = req.body.eventType;
        if (!eventType) {
          let error = new Error(`Malformed CloudEvent message. The required 'eventType' property is not specified.`);
          error.statusCode = 400;
          return next(error);
        }
        var handler = subscriptions[eventType];
        if (handler == null || typeof handler !== 'function') {
          let error = new Error(`Unuspported eventType: ${eventType}.`);
          error.statusCode = 501;
          return next(error);
        }
        else {
          if (handler.length === 1) {
            res.writeHead(201)
            res.end(); 
          }
          var ctx = {
            event: req.body,
            secrets: req.webtaskContext.secrets,
            meta: req.webtaskContext.meta
          };

          return handler(ctx, (e,d) => {
            if (e) return next(e);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(d));
          });
        }
      }
    };
};
