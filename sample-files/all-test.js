(function (user, context, callback) {
  user.app_metadata = user.app_metadata || {};

  if (user.refresh_token) {
    user.app_metadata.refresh_token = user.refresh_token;
    auth0.users.updateAppMetadata(user.user_id, user.app_metadata)
      .then(function(){
        callback(null, user, context);
      })
      .catch(function(err){
        callback(err);
      });
  } else {
    callback(null, user, context);
  }
})
