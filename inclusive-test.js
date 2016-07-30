(function(user, context, callback) {

  if (context.clientName === 'TheAppToCheckAccessTo') {
    var d = new Date().getDay();

    if (d === 0 || d === 6) {
      return callback(new UnauthorizedError('This app is available during the week'));
    }
  }

  callback(null, user, context);
})
