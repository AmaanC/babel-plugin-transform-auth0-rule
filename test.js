function original(user, context, callback) {
    const foo = 'a';
    context.xyz = 'foo';
    let a = true;
    if (context.clientName !== 'Default App' && a === true) {
	return callback(null, user, context);
    }
    if (context.clientName !== 'XYZ' && a === false) {
	return callback(null, user, context);
    }
   
    var whitelist = [ 'someone@example.com' ];
    var userHasAccess = whitelist.some(
	function (email) {
            return email === user.email;
	});
    if (!userHasAccess) {
	return callback(new UnauthorizedError('Access denied.'));
    }

    callback(null, user, context);
}
