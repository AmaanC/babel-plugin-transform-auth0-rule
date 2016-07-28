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
	// Number of statements we've already processed in MainProcessor
	// This is needed so we can know when we're at the last Statement so
	// that we can insert returnApplies (discussed later) right after
	processedStatements: 0,
	// This will be set in MainProcessor's stage 0
	// TODO: Test with empty block
	blockNumStatements: undefined,
	// Top-level Statement nodes that show up _before_ our
	// relevant `if` condition
	// This array of nodes is stored so it can later be filtered
	// to remove anything that isn't needed in the `if` expression
	setupNodes: [],
	// All the IfStatements which include "relevant" MemberExpression
	// (see: context.clientName and context.clientID)
	ifNodes: [],
	// The following will all be filled in later by MainProcessor
	// appliesName holds a UID identifier for a variable "applies"
	appliesName: undefined,
	// appliesInitFalse holds a VariableDeclaration initializing "applies"
	// to `false`
	appliesInitFalse: undefined,
	// returnApplies holds a ReturnStatement; basically `return applies;`
	// but with `applies` being filled in dynamically based on its UID
	returnApplies: undefined
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
		// Aliasing so it's easier to use
		let g = globalState;
		g.depthLevel++;
		if (g.depthLevel === 1) {
		    g.processedStatements++;
		}
		// If this occurs, we're about to start processing statements
		// we just inserted. Let's skip that
		if (g.processedStatements > g.blockNumStatements) {
		    return;
		}
		console.log(path.node.type);
		switch (g.transformationStage) {
		    case 0:
		    	g.appliesName = path.scope.generateUidIdentifier('applies');
		    	g.appliesInitFalse = t.variableDeclaration(
			    'let',
			    [t.variableDeclarator(
				g.appliesName, t.booleanLiteral(false)
			    )]
			);
		    	g.returnApplies = t.returnStatement(g.appliesName);

		    	// Store how many Statements the FunctionDeclaration's
		    	// BlockStatement has. Used to insert g.returnApplies
		    	// at the end of the block
		    	// NOTE! This needs to be stored _before_ we insert
		    	// because after we do, the length will change
		    	// and what we've inserted will be visited after
		    	// the statements that were already there in the block
		    	// Removing statements after they've been processed,
		    	// i.e. removing them in _this_ visitor is okay.
		    	g.blockNumStatements = path.parentPath.node.body.length;
		    
		    	path.insertBefore(g.appliesInitFalse);

		    	// We've inserted the appliesInitFalse statement
		    	// and can move to the next stage and never come back
		    	g.transformationStage = 1;
		    	break;
		    case 1:
		    	if (g.processedStatements === g.blockNumStatements) {
			    path.insertAfter(g.returnApplies);
			}
		    	break;
		}
	    },
	    exit(path) {
		globalState.depthLevel--;
	    }
	}
    };
    
    return {
	visitor: MyRuleVisitor
    };
}

module.exports = plugin;
