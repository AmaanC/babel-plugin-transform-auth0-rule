function original(user, context, callback) {
    // let _applies = false; inserted here
    const foo = 'a'; // This should be removed
    context.xyz = 'foo'; // This should stay
    let a = true;
    if (context.clientName !== 'Default App' && a === true) {
	return callback(null, user, context);
	// Replaced with:
	// return _applies;
    }
    if (context.clientName !== 'XYZ' && a === false) {
	return callback(null, user, context);
	// Replaced with:
	// return _applies;
    }

    // {
    var whitelist = [ 'someone@example.com' ];
    var userHasAccess = whitelist.some(
	function (email) {
            return email === user.email;
	});
    if (!userHasAccess) {
	return callback(new UnauthorizedError('Access denied.'));
    }
    // }
    // Replaced with:
    // _applies = true;

    callback(null, user, context);
    // Replaced with _applies;
    // return _applies; inserted here
}
