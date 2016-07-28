function plugin({ types: t }) {
    /* Variable used to hold state across various visitors
     */
    const globalState = {
	// Depth of statements as illustrated here:
	// https://github.com/thejameskyle/babel-handbook/blob/master/translations/en/plugin-handbook.md#user-content-toc-asts
	// Note that this is tracked after we enter a FunctionDeclaration's
	// BlockStatement, _not_ as soon as the AST is generated
	depthLevel: 0,
	// The stage we're at in MainProcessor
	// (It's basically simulating a finite state machine)
	transformationStage: 0,
	// Top-level Statement nodes that show up _before_ our
	// relevant `if` condition
	// This array of nodes is stored so it can later be filtered
	// to remove anything that isn't needed in the `if` expression
	setupNodes: [],
	// All the IfStatements which include "relevant" MemberExpression
	// (see: context.clientName and context.clientID)
	ifNodes: []
    };
    
    /* MyRuleVisitor is the top-level visitor.
     * All it does is pull out the parameters for the Rule and pass them on
     * to the BlockVisitor
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
	    path.traverse(BlockVisitor, fnParams);
	}
    };

    /* BlockVisitor simply takes a BlockStatement and passes it onto
     * MainProcessor
     */
    const BlockVisitor = {
	BlockStatement(path) {
	    path.traverse(MainProcessor, this);
	}
    };

    /* MainProcessor is where all the action happens.
     * TODO: Explain how.
     */
    const MainProcessor = {
	Statement: {
	    enter(path) {
		console.log(path.node.type);
	    }
	}
    };
    
    return {
	visitor: MyRuleVisitor
    };
}

module.exports = plugin;
