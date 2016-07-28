function plugin({ types: t }) {
    /* MyRuleVisitor is the top-level visitor.
     */
    const MyRuleVisitor = {
	FunctionDeclaration(path) {
	    const params = path.node.params;
	    let user, context, callback;
	    if (params[0] && params[0].name) {
		user = params[0].name;
	    }
	    if (params[1] && params[1].name) {
		context = params[1].name;
	    }
	    if (params[2] && params[2].name) {
		callback = params[2].name;
	    }
	    const fnParams = { user, context, callback };
	    console.log(fnParams);
	}
    };

    return {
	visitor: MyRuleVisitor
    };
}

module.exports = plugin;
