var grpc = require("@grpc/grpc-js"),
  protoLoader = require("@grpc/proto-loader"),
  path = require("path"),
  uuid = require("uuid").v4;

let pkgPromise;

function withSession(docker, auth, handler) {
  pkgPromise ||= protoLoader.load(
    path.resolve(__dirname, "proto", "auth.proto")
  );

  pkgPromise
    .then((pkg) => {
      const service = grpc.loadPackageDefinition(pkg);
      const server = new grpc.Server();
      const creds = grpc.ServerCredentials.createInsecure();
      const injector = server.createConnectionInjector(creds);

      server.addService(service.moby.filesync.v1.Auth.service, {
        Credentials({ request }, callback) {
          console.log("now");

          // We probably want to have the possibility to pass credentials per
          // hots. The correct one could be returned based on `request.Host`
          if (auth) {
            callback(null, {
              Username: auth.username,
              Secret: auth.password,
            });
          } else {
            callback(null, {});
          }
        },
      });

      const sessionId = uuid();

      const opts = {
        method: "POST",
        path: "/session",
        hijack: true,
        headers: {
          Upgrade: "h2c",
          "X-Docker-Expose-Session-Uuid": sessionId,
          "X-Docker-Expose-Session-Name": "testcontainers",
        },
        statusCodes: {
          200: true,
          500: "server error",
        },
      };

      docker.modem.dial(opts, function (err, socket) {
        if (err) {
          return handler(err, null, () => undefined);
        }

        injector.injectConnection(socket);

        function done() {
          console.log("done");
          server.forceShutdown();
          socket.end();
        }

        handler(null, sessionId, done);
      });
    })
    .catch((err) => {
      handler(err, null, () => undefined);
    });
}

module.exports = withSession;
