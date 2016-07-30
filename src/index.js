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
	// All the IfStatements which include "relevant" MemberExpression
	// (see: context.clientName and context.clientID)
	ifNodes: [],
	// An array of all the identifiers that our ifNodes may depend on
	neededIdentifiers: [],
	// The following will all be filled in later by MainProcessor
	// appliesName holds a UID identifier for a variable "applies"
	appliesName: undefined,
	// appliesInitFalse holds a VariableDeclaration initializing "applies"
	// to `false`
	appliesInitFalse: undefined,
	// appliesSetTrue is basically `_applies = true;`
	appliesSetTrue: undefined,
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

    /* The function takes an object, searchKey, and value and recursively
     * checks child objects for objects containing a searchKey with the matching
     * value.
     * An array of all matching objects is returned.
     * If there are no matches, an empty array is returned.
     */
    function findObjectsWithKeyVal(obj, searchKey, value) {
	let matchingObjects = [];
	if (typeof obj !== 'object' || obj === null) {
	    return new Error('Could not find ' + searchKey + ', ' + value + ' in ' + obj);
	}
	if (obj.hasOwnProperty(searchKey) && obj[searchKey] === value) {
	    matchingObjects.push(obj);
	}
	for (let curKey in obj) {
	    if (typeof obj[curKey] === 'object' && obj[curKey] !== null) {
		matchingObjects = matchingObjects.concat(findObjectsWithKeyVal(obj[curKey], searchKey, value));
	    }						
	}
	return matchingObjects;
    }
    
    /* This function takes a `path.node` object for an IfStatement
     * and returns true if the IfStatement's `test` depends on
     * `context.clientName` or `context.clientID`
     * Note: This function only checks for MemberExpressions of that
     * kind.
     * It won't detect `context['clientName']` for example.
     * TODO: Consider adding that and reading the `computed` attribute.
     */
    function containsMemberExp(ifObj, params) {
	if (!ifObj || ifObj.type !== 'IfStatement' || !ifObj.test) {
	    return new Error('Could not find MemberExpression in malformed IfStatement');
	}
	const memExps = findObjectsWithKeyVal(ifObj.test, 'type', 'MemberExpression');
	for (let curMemExp of memExps) {
	    if (curMemExp.object.name === params.context &&
		(curMemExp.property.name === 'clientName' ||
		 curMemExp.property.name === 'clientID'))
	    {
		return true;
	    }
	}
	return false;
    }

    /* This function will take a `path.node` object (for the BlockStatement)
     * and it'll look through all sub-objects recursively for
     * IfStatements.
     * If the IfStatement's `test` expression depends on
     * `context.clientName` or `context.clientID` in any way,
     * the IfStatement is pushed into globalState.ifNodes and
     * all of its expression's Identifiers are pushed into
     * globalState.neededIdentifiers
     * TODO: Consider dependencies such as:
     * let c = context;
     * if (c.clientName === 'foo') { ... }
     * For now, we're just ignoring that.
     */
    function extractRelevantIfs(obj, params) {
	let relevantIfs = [];
	for (let key in obj) {
	    if (typeof obj[key] === 'object' &&
		obj[key] !== null &&
		obj[key]._visitedToExtract !== true &&
		obj.hasOwnProperty(key) &&
		obj[key].hasOwnProperty)
	    {
		// We need to keep track since these objects can contain
		// themselves (think parentPath followed by child nodes)
		obj[key]._visitedToExtract = true;
		relevantIfs = relevantIfs.concat(extractRelevantIfs(obj[key], params));
		if (obj[key].type === 'IfStatement' &&
		    containsMemberExp(obj[key], params))
		{
		    relevantIfs.push(obj[key]);
		}
	    }
	}
	return relevantIfs;
    }

    /* This function takes a Node as input and returns all child Identifiers
     * it can find in an array
     */
    function extractIdentifiers(node) {
	const allIdentifiers = findObjectsWithKeyVal(
	    node, 'type', 'Identifier'
	).map(function(identifierObj) {
	    return identifierObj.name;
	});
	return allIdentifiers;
    }

    function isDefaultCallback(callExpression, params) {
	const args = callExpression.arguments;
	if (t.isCallExpression(callExpression) &&
	    t.isIdentifier(callExpression.callee) &&
	    callExpression.callee.name === params.callback &&
	    t.isNullLiteral(args[0]) &&
	    t.isIdentifier(args[1]) &&
	    t.isIdentifier(args[2]) &&
	    args[1].name === params.user &&
	    args[2].name === params.context
	   )
	{
	    return true;
	}
	return false;
    }

    /*
     *
     */
    function isDefaultReturn(statement, params) {
	if (
	    (t.isReturnStatement(statement) &&
	     t.isCallExpression(statement.argument) &&
	     isDefaultCallback(statement.argument, params)) ||
	    (t.isReturnStatement(statement) &&
	     t.isLiteral(statement.argument))
	)
	{
	    return true;
	}
	return false;
    }
    
    // TODO: Update this
    /* The function takes a single Statement as input and checks to
     * see if it counts as a "default" statement
     * Only the following count as default code:
     * return callback(null, user, context);
     * callback(null, user, context);
     * return Literal;
     *
     * Anything apart from those 3 are thought of as non-default
     * code, i.e. code that indicates that we're actually executing
     * something for the current rule
     */
    function isDefaultCode(statement, params) {
	if (t.isExpressionStatement(statement) &&
	     isDefaultCallback(statement.expression, params)
	)
	{
	    return true;
	}
	return false;
    }

    /* This function takes a statement and the Rule's parameter names
     * as input
     * It processes the statement to figure out if it can be removed
     * or replaced and does so, based on the following heuristics:
     * 1. If the node is not a relevant ifNode &&
     *    the node is non-default code (more on this later) &&
     *    no relevant ifNodes further ahead depend on this statement
     *
     *    If all hold true, we can rem
     * We can remove all "default" code. If it is a
     * `callback(null, user, context)`, it can simply be thrown out.
     * If it is non-default code, we can throw it out if:
     * 1. It is not a relevant ifNode
     * 2. It contains 0 identifiers that ifNodes depend on further ahead
     * 3.
     TODO: Update this
     */
    function processAndUpdateNode(path, params) {
	const g = globalState;
	if (isDefaultCode(path.node, params)) {
	    path.remove();
	}
	else if (isDefaultReturn(path.node, params)) {
	    path.replaceWith(g.returnApplies);
	}
	// If it isn't default code, and it isn't a relevant ifNode
	// we'll start checking to see if it's a dependency
	else if (g.ifNodes.indexOf(path.node) === -1) {
	    const identifiersInNode = extractIdentifiers(path.node);
	    // The only way the current path.node is considered a
	    // "dependency" is if:
	    // 1. It contains common identifiers with some relevant ifNode
	    // 2. It occurs _before_ that ifNode
	    // Note: Control statements could screw this up, but we're
	    // only sticking to simple use cases and will need to make that
	    // obvious
	    let isDependency = false;
	    let isPart1 = true;
	    for (let curIfNode of g.ifNodes) {
		let commonIdentifiers = curIfNode._neededIdentifiers.some(function(identifier) {
		    return identifiersInNode.indexOf(identifier) !== -1;
		});
		// TODO: Consider the edge cases. Oh, so many possible
		// edge cases. :(
		if (commonIdentifiers && path.node.end < curIfNode.start) {
		    isDependency = true;
		}
		else if (path.node.start > curIfNode.start) {
		    isPart1 = false;
		}
	    }
	    
	    // It isn't a dependency, so we can remove it.
	    if (isDependency === false && path.node.type !== 'BlockStatement') {
		if (isPart1 === true) {
		    path.remove();
		}
		else {
		    path.replaceWith(g.appliesSetTrue);
		}
	    }

	    
	    // path.replaceWith(g.appliesSetTrue);
	}
    }
    
    /* MainProcessor is where all the action happens.
     * TODO: Explain how.
     * The MainProcessor visitor starts at the first Statement inside
     * the Rule's BlockStatement (which is inside the FunctionDeclaration)
     *
     * Stage 0:
     * We insert a `let _applies = false;` to
     * the top of the function. This variable will be used to determine if
     * the function "applies" to a certain client or not.
     * We also store the number of root-level statements that the function
     * will have so that we can determine when we're at the end and need
     * to insert a `return _applies;` to the end of the function.
     * We'll also find all the "relevant" IfStatements, i.e.
     * all the IfStatements which include the MemberExpressions for
     * `context.clientName` or `context.clientID`
     * Since we haven't actually processed the first statement at all,
     * we want to fall through to the next stage (and never come back to
     * this stage)
     *
     * Stage 1:
     * At this point, we already have the relevantIfStatements
     * The way we determine if something "applies" to a certain client
     * is by seeing if it runs any special code for that client.
     * All code common to all rules is pointless in helping us determine this.
     * "Special code" is a bit problematic.
     * The easiest way to think of it is:
     * If there is a relevant IfStatement, and the only code in it is
     * "default code", i.e. `return callback(null, user, context);`
     * then that IfStatement is _not_ special code. Anything _after_
     * that IfStatement _is_ special code.
     * I'll refer to this condition as "exclusive" rules, because
     * when the if conditions are successful, rules are excluded.
     *
     * When a relevant IfStatement's consequent includes anything that is not
     * "default code", it's running special code.
     *
     * So here's what this stage does. It goes through the relevant
     * IfStatements and checks its consequents. If the consequent is "default
     * code", then we replace it with `return false;`
     * If the consequent is not default code, we replace it with
     * `_applies = true;`
     *
     * Once we're done processing the IfStatements, we'll process all the
     * remaining Statements. They need to be removed conditionally.
     * If our IfStatements depend on them, keep them. Else, throw them.
     *
     * The key to understanding the solution is that by default
     * a rule will run for every client. Only conditional structures
     * can change that.
     * Therefore, if we pay attention to our IfStatements and what code
     * runs within them, we can figure out if special treatment is being
     * given to any clients.
     */
    const MainProcessor = {
	Statement: {
	    enter(path) {
		// Aliasing so it's easier to use
		let g = globalState;
		if (path.node === g.returnApplies ||
		    path.node === g.appliesSetTrue ||
		    path.node === g.appliesInitFalse)
		{
		    return;
		}
		g.depthLevel++;
		if (g.depthLevel === 1) {
		    g.processedStatements++;
		}
		// If this occurs, we're about to start processing statements
		// we just inserted. Let's skip that
		if (g.processedStatements > g.blockNumStatements) {
		    console.log('Skipping', path.node.type);
		    return;
		}
		// The following is all one-time code that runs in stage 0
		if (g.transformationStage === 0) {
		    g.ifNodes = extractRelevantIfs(path.parentPath, this);
		    for (let curIfNode of g.ifNodes) {
			// Let's loop over all the relevant ifNodes and
			// extract all identifiers in them
			// Note: neededIdentifiers may have duplicates, and
			// for now, we're okay with that.
			// TODO: UPDATE THIS AND REMOVE THE GLOBAL PROP
			curIfNode._neededIdentifiers = extractIdentifiers(curIfNode.test);
		    }
		    
		    g.appliesName = path.scope.generateUidIdentifier('applies');
		    g.appliesInitFalse = t.variableDeclaration(
			'let',
			[t.variableDeclarator(
			    g.appliesName, t.booleanLiteral(false)
			)]
		    );
		    g.appliesSetTrue = t.expressionStatement(
			t.assignmentExpression(
			    '=',
			    g.appliesName,
			    t.booleanLiteral(true)
			)
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
		}

		// Stage 1 starts here. We either fell through or came here
		// directly

		// First we'll check if we're at the last statement, and if so
		// add a `return _applies;`
		if (g.processedStatements === g.blockNumStatements) {
		    path.insertAfter(g.returnApplies);
		}

		// At this point, we want to start replacing useless
		// code.
		// Code can only be replaced if the following
		// hold true
		// 1. The Statement is a "non-default" statement
		// 2. The Statement includes 0 identifiers that future
		//    relevant ifNodes may depend on.
		// 3. The Statement is not a relevant IfNode
		// TODO: Update this
	    },
	    exit(path) {
		const g = globalState;
		if (path.node === g.returnApplies ||
		    path.node === g.appliesSetTrue ||
		    path.node === g.appliesInitFalse)
		{
		    return;
		}
		g.depthLevel--;
		if (g.processedStatements > g.blockNumStatements) {
		    return;
		}
		processAndUpdateNode(path, this);

	    }
	}
    };
    
    return {
	visitor: MyRuleVisitor
    };
}

module.exports = plugin;
