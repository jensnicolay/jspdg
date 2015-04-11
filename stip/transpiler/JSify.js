/****************************************************************
 *				 TRANSFORMATIONS FOR JAVASCRIPT					*
 *																*
 *  has no transformations for distributed setting,				*
 * 	but is meant to use for slicing only.						*
 *																*
 *  Supports CPS transformations								*
 *																*
 ****************************************************************/

var JSify = (function () {


	var makeShouldTransform = function (cps) {
			return function (call) {
				return cps
			}
		},

		makeTransformer = function (cps) {
		return {  AST        : graphs.AST, 
				  transformF : toJavaScript, 
				  callbackF  : JSParse.callback, 
				  asyncCallF : JSParse.RPC, 
				  asyncFuncF : JSParse.asyncFun,
				  shouldTransform : makeShouldTransform(cps) 
				}
	},
		module = {};

	/* Variable declaration  + Assignment Expression */
	var sliceVarDecl = function (slicednodes, node, cps) {
	  	var entry = node.getOutEdges(EDGES.DATA)
	  					.filter(function (e) {
							return e.to.isEntryNode;
					    })
					    .map(function (e) { return e.to }),
	  		call = node.getOutEdges(EDGES.CONTROL)
	  		           .filter(function (e) {
	  		           	  return e.to.isCallNode;
	  		           })
	  		           .map(function (e) { return e.to }),
	  		object = node.getOutEdges(EDGES.DATA)
	  		             .filter(function (e) {
	  		             	return e.to.isObjectEntry;
	  		              })
	  		             .map(function (e) {return e.to});
	    /* Outgoing data dependency to entry node? */
		if (entry.length > 0) {
	     	var f = toJavaScript(slicednodes, entry[0], cps);
	     	if (esp_isVarDecl(node.parsenode))
		 		node.parsenode.declarations[0].init = f.parsednode;
		 	else if (esp_isExpStm(node.parsenode) && 
		 		     esp_isAssignmentExp(node.parsenode.expression))
		 		node.parsenode.right = f.parsednode; 
		 	slicednodes = f.nodes;
		}
		/* Outgoing data dependency to object entry node? */
		if (object.length > 0) {
			var obj = toJavaScript(slicednodes, object[0], cps);
			if (esp_isVarDecl(node.parsenode))
		 		node.parsenode.declarations[0].init = obj.parsednode;
		 	else if (esp_isExpStm(node.parsenode) && 
		 		     esp_isAssignmentExp(node.parsenode.expression))
		 		node.parsenode.right = obj.parsednode; 
		 	slicednodes = obj.nodes;
		}
		/* Has call nodes in value? */
		if (call.length > 0) {
			var transformer = makeTransformer(cps),
				cpsvar		= CPSTransform.transformExp(node, slicednodes, transformer)
			if (cpsvar[1])
				return new Sliced(cpsvar[0], node, cpsvar[1].parsenode)
			else 
				return new Sliced(slicednodes, node, node.parsenode)
		}
		return new Sliced(slicednodes, node, node.parsenode);
	}


	/* Binary expression */
	var sliceBinExp = function (slicednodes, node, cps) {
		var call = node.getOutEdges(EDGES.CONTROL)
		               .filter(function (e) {
						  return e.to.isCallNode
				       });
		if (call.length > 0) {
			var transformer = makeTransformer(cps),
				cpsvar		= CPSTransform.transformExp(node, slicednodes, transformer)
			return new Sliced(cpsvar[0], node, cpsvar[1].parsenode)
		}

		return new Sliced(slicednodes, node, node.parsenode)
	}

	/* Function Expression */
	var sliceFunExp = function (slicednodes, node, cps) {
		// Formal parameters
		var form_ins  = node.getFormalIn(),
			form_outs = node.getFormalOut(),
		    parsenode = node.parsenode,
		    params    = parsenode.params;
		// Formal in parameters
		if(form_ins.length > 0) {
			// Remove parameters that are not in slicednodes
			for(var i = 0; i < form_ins.length; i++) {
				var fp = form_ins[i],
				     p = params[i];
				if(!slicedContains(slicednodes,fp)) {
					params.splice(i,1);
				}
				slicednodes = slicednodes.remove(fp);
			}
			parsenode.params = params;
		};
		// Formal out parameters
		form_outs.map(function (f_out) {
			slicednodes = slicednodes.remove(f_out)
		})
		// Body
		var body = [],
		    bodynodes = node.getOutEdges(EDGES.CONTROL)
		                    .filter(function (e) {
				              return e.to.isStatementNode || e.to.isCallNode;
		                    })
		                    .map(function (e) { return e.to });
		bodynodes.map(function (n) {
			var bodynode = toJavaScript(slicednodes, n, cps);
			if(slicedContains(slicednodes, n)) {
				body = body.concat(bodynode.parsednode);
			}
			slicednodes = removeNode(bodynode.nodes,n);
			
			});
		slicednodes = slicednodes.remove(node);
		parsenode.body.body = body;
		if (cps) {
			var transformer = makeTransformer(cps),
				cpsfun      = CPSTransform.transformFunction(node, slicednodes, transformer);
			return new Sliced(cpsfun[0], node, cpsfun[1].parsenode)
		}
		return new Sliced(slicednodes, node, parsenode);
	}

	var sliceCallExp = function (slicednodes, node, cps) {
		var actual_ins  = node.getActualIn(),
			actual_outs = node.getActualOut(),	
		    parent 		= Ast.parent(node.parsenode,graphs.AST);
		actual_ins.map(function (a_in) {
			slicednodes = slicednodes.remove(a_in)
		})
		actual_outs.map(function (a_out) {
			slicednodes = slicednodes.remove(a_out)
		})
		if (cps) {
			var transformer = makeTransformer(cps),
				cpscall		= CPSTransform.transformCall(node, slicednodes, transformer);
			return new Sliced(cpscall[0], node, cpscall[1].parsenode)
		}
		return new Sliced(slicednodes, node, parent)
	}

	var sliceRetStm = function (slicednodes, node, cps) {
		var call = node.getOutEdges(EDGES.CONTROL)
		               .filter(function (e) {
						return  e.to.isCallNode
				       });
		if (call.length > 0) {
			var transformer = makeTransformer(cps),
				cpsvar		= CPSTransform.transformExp(node, slicednodes, transformer)
			return new Sliced(cpsvar[0], node, cpsvar[1].parsenode)
		}

		return new Sliced(slicednodes, node, node.parsenode)
	}

	var sliceBlockStm = function (slicednodes, node, cps) {
		var body = [],
			parsenode = node.parsenode,
		    bodynodes = node.getOutEdges(EDGES.CONTROL)
		    			    .map(function (e) {return e.to});
		bodynodes.map(function (n) {
			var bodynode = toJavaScript(slicednodes, n, cps);
			if (slicedContains(slicednodes, n)) {
					body = body.concat(bodynode.parsednode)
			}
			slicednodes = removeNode(bodynode.nodes, n);	
			});
		slicednodes = slicednodes.remove(node);
		parsenode.body = body;
		return new Sliced(slicednodes, node, parsenode);
	}

	var sliceObjExp = function (slicednodes, node, cps) {
		var prop = node.getOutEdges(EDGES.OBJMEMBER)
					   .map(function (e) {
							return e.to
						}),
			properties = [],
			parsenode  = node.parsenode;
		prop.map(function (property) {
			if (slicedContains(slicednodes, property)) {
				var propnode = toJavaScript(slicednodes, property, cps);
				properties = properties.concat(propnode.parsednode);
				slicednodes = removeNode(propnode.nodes, property)
			}
		});
		slicednodes = slicednodes.remove(node);
		parsenode.properties = properties;
		return new Sliced(slicednodes, node, parsenode);
	}

	var removeNode = function (nodes, node, cps) {
		nodes = nodes.remove(node);
		var callnode = false;
		nodes.map(function (n) {
			if(n.parsenode) {
			var parent = Ast.parent(n.parsenode,graphs.AST);
			if(n.isCallNode && (n.parsenode === node.parsenode || parent === node.parsenode)) {
				callnode = n
			}
		}
		});
		if(callnode) 
		  	return nodes.remove(callnode);
		else
			return nodes;
	}

	var slicedContains = function (nodes, node, cps) {
	 	return nodes.filter(function (n) {
			if(n.isCallNode) {
				return n.parsenode === node.parsenode
			} else
			return n.id === node.id
		}).length > 0
	}


	// Non distributed version.
	var toJavaScript = function (slicednodes, node, cps) {
		if(node.isActualPNode || node.isFormalNode) {
			return new Sliced(slicednodes, node, false);
		}
		var parent = Ast.parent(node.parsenode,graphs.AST);
		if(parent && esp_isRetStm(parent)) {
			node.parsenode = parent
		}
		if(parent && esp_isExpStm(parent) && !(esp_isCallExp(node.parsenode))) {
			node.parsenode = parent
		}
		console.log('SLICE(' + node.parsenode.type + ') ' + node.parsenode);
		switch (node.parsenode.type) {
	      case 'VariableDeclaration': 
			return sliceVarDecl(slicednodes, node, cps);
		  case 'VariableDeclarator':
		    return sliceVarDecl(slicednodes, node, cps);
		  case 'FunctionExpression':
		    return sliceFunExp(slicednodes, node, cps);
		  case 'FunctionDeclaration':
		    return sliceFunExp(slicednodes, node, cps);
		  case 'BlockStatement':
			return sliceBlockStm(slicednodes, node, cps);
		  case 'CallExpression':
		  	return sliceCallExp(slicednodes, node, cps);
		  case 'BinaryExpression':
		  	return sliceBinExp(slicednodes, node, cps);
		  case 'ObjectExpression':
		  	return sliceObjExp(slicednodes, node, cps);
		  default: 
		  	if (esp_isRetStm(node.parsenode) && 
		  		node.getOutEdges(EDGES.CONTROL).filter(function (e) {
		  				return e.to.isCallNode
		  			}).length > 0)
		  		return sliceRetStm(slicednodes, node, cps)
		  	if(esp_isExpStm(node.parsenode) && esp_isAssignmentExp(node.parsenode.expression))
		  		return sliceVarDecl(slicednodes, node, cps)
		  	if(esp_isExpStm(node.parsenode) && esp_isBinExp(node.parsenode.expression))
				return sliceBinExp(slicednodes, node, cps)
		    return new Sliced(slicednodes, node, node.parsenode);
	    }
	}

	module.transpile = toJavaScript;

	return module;
})();