/*\
title: $:/core/modules/wiki.js
type: application/javascript
module-type: wikimethod

Extension methods for the $tw.Wiki object

Adds the following properties to the wiki object:

* `eventListeners` is a hashmap by type of arrays of listener functions
* `changedTiddlers` is a hashmap describing changes to named tiddlers since wiki change events were
last dispatched. Each entry is a hashmap containing two fields:
	modified: true/false
	deleted: true/false
* `changeCount` is a hashmap by tiddler title containing a numerical index that starts at zero and is
	incremented each time a tiddler is created changed or deleted
* `caches` is a hashmap by tiddler title containing a further hashmap of named cache objects. Caches
	are automatically cleared when a tiddler is modified or deleted

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var USER_NAME_TITLE = "$:/status/UserName";

/*
Get the value of a text reference. Text references can have any of these forms:
	<tiddlertitle>
	<tiddlertitle>!!<fieldname>
	!!<fieldname> - specifies a field of the current tiddlers
	<tiddlertitle>##<index>
*/
exports.getTextReference = function(textRef,defaultText,currTiddlerTitle) {
	var tr = $tw.utils.parseTextReference(textRef),
		title = tr.title || currTiddlerTitle;
	if(tr.field) {
		var tiddler = this.getTiddler(title);
		if(tr.field === "title") { // Special case so we can return the title of a non-existent tiddler
			return title;
		} else if(tiddler && $tw.utils.hop(tiddler.fields,tr.field)) {
			return tiddler.getFieldString(tr.field);
		} else {
			return defaultText;
		}
	} else if(tr.index) {
		return this.extractTiddlerDataItem(title,tr.index,defaultText);
	} else {
		return this.getTiddlerText(title,defaultText);
	}
};

exports.setTextReference = function(textRef,value,currTiddlerTitle) {
	var tr = $tw.utils.parseTextReference(textRef),
		title,tiddler,fields;
	// Check if it is a reference to a tiddler
	if(tr.title && !tr.field) {
		tiddler = this.getTiddler(tr.title);
		this.addTiddler(new $tw.Tiddler(tiddler,{title: tr.title,text: value},this.getModificationFields()));
	// Else check for a field reference
	} else if(tr.field) {
		title = tr.title || currTiddlerTitle;
		tiddler = this.getTiddler(title);
		if(tiddler) {
			fields = {};
			fields[tr.field] = value;
			this.addTiddler(new $tw.Tiddler(tiddler,fields,this.getModificationFields()));
		}
	}
};

exports.deleteTextReference = function(textRef,currTiddlerTitle) {
	var tr = $tw.utils.parseTextReference(textRef),
		title,tiddler,fields;
	// Check if it is a reference to a tiddler
	if(tr.title && !tr.field) {
		this.deleteTiddler(tr.title);
	// Else check for a field reference
	} else if(tr.field) {
		title = tr.title || currTiddlerTitle;
		tiddler = this.getTiddler(title);
		if(tiddler && $tw.utils.hop(tiddler.fields,tr.field)) {
			fields = {};
			fields[tr.field] = undefined;
			this.addTiddler(new $tw.Tiddler(tiddler,fields,this.getModificationFields()));
		}
	}
};

exports.addEventListener = function(type,listener) {
	this.eventListeners = this.eventListeners || {};
	this.eventListeners[type] = this.eventListeners[type]  || [];
	this.eventListeners[type].push(listener);	
};

exports.removeEventListener = function(type,listener) {
	var listeners = this.eventListeners[type];
	if(listeners) {
		var p = listeners.indexOf(listener);
		if(p !== -1) {
			listeners.splice(p,1);
		}
	}
};

exports.dispatchEvent = function(type /*, args */) {
	var args = Array.prototype.slice.call(arguments,1),
		listeners = this.eventListeners[type];
	if(listeners) {
		for(var p=0; p<listeners.length; p++) {
			var listener = listeners[p];
			listener.apply(listener,args);
		}
	}
};

/*
Causes a tiddler to be marked as changed, incrementing the change count, and triggers event handlers.
This method should be called after the changes it describes have been made to the wiki.tiddlers[] array.
	title: Title of tiddler
	isDeleted: defaults to false (meaning the tiddler has been created or modified),
		true if the tiddler has been created
*/
exports.enqueueTiddlerEvent = function(title,isDeleted) {
	// Record the touch in the list of changed tiddlers
	this.changedTiddlers = this.changedTiddlers || {};
	this.changedTiddlers[title] = this.changedTiddlers[title] || {};
	this.changedTiddlers[title][isDeleted ? "deleted" : "modified"] = true;
	// Increment the change count
	this.changeCount = this.changeCount || {};
	if($tw.utils.hop(this.changeCount,title)) {
		this.changeCount[title]++;
	} else {
		this.changeCount[title] = 1;
	}
	// Trigger events
	this.eventListeners = this.eventListeners || [];
	if(!this.eventsTriggered) {
		var self = this;
		$tw.utils.nextTick(function() {
			var changes = self.changedTiddlers;
			self.changedTiddlers = {};
			self.eventsTriggered = false;
			self.dispatchEvent("change",changes);
		});
		this.eventsTriggered = true;
	}
};

exports.getChangeCount = function(title) {
	this.changeCount = this.changeCount || {};
	if($tw.utils.hop(this.changeCount,title)) {
		return this.changeCount[title];
	} else {
		return 0;
	}
};

exports.deleteTiddler = function(title) {
	delete this.tiddlers[title];
	this.clearCache(title);
	this.enqueueTiddlerEvent(title,true);
};

exports.tiddlerExists = function(title) {
	return !!this.tiddlers[title];
};

exports.isSystemTiddler = function(title) {
	return title.indexOf("$:/") === 0;
};

exports.isTemporaryTiddler = function(title) {
	return title.indexOf("$:/temp/") === 0;
};

/*
Determines if a tiddler is a shadow tiddler, regardless of whether it has been overridden by a real tiddler
*/
exports.isShadowTiddler = function(title) {
	return $tw.utils.hop(this.shadowTiddlers,title);
};

exports.addTiddler = function(tiddler) {
	// Check if we're passed a fields hashmap instead of a tiddler
	if(!(tiddler instanceof $tw.Tiddler)) {
		tiddler = new $tw.Tiddler(tiddler);
	}
	// Get the title
	var title = tiddler.fields.title;
	// Save the tiddler
	this.tiddlers[title] = tiddler;
	this.clearCache(title);
	this.enqueueTiddlerEvent(title);
};

/*
Return a hashmap of the fields that should be set when a tiddler is created
*/
exports.getCreationFields = function() {
	var fields = {
			created: new Date()
		},
		creator = this.getTiddlerText(USER_NAME_TITLE);
	if(creator) {
		fields.creator = creator;
	}
	return fields;
};

/*
Return a hashmap of the fields that should be set when a tiddler is modified
*/
exports.getModificationFields = function() {
	var fields = {},
		modifier = this.getTiddlerText(USER_NAME_TITLE);
	fields.modified = new Date();
	if(modifier) {
		fields.modifier = modifier;
	}
	return fields;
};

/*
Return a sorted array of non-system tiddler titles, optionally filtered by a tag 
*/
exports.getTiddlers = function(sortField,excludeTag) {
	sortField = sortField || "title";
	var tiddlers = [], t, titles = [];
	for(t in this.tiddlers) {
		if($tw.utils.hop(this.tiddlers,t) && !this.isSystemTiddler(t) && (!excludeTag || !this.tiddlers[t].hasTag(excludeTag))) {
			tiddlers.push(this.tiddlers[t]);
		}
	}
	tiddlers.sort(function(a,b) {
		var aa = a.fields[sortField].toLowerCase() || "",
			bb = b.fields[sortField].toLowerCase() || "";
		if(aa < bb) {
			return -1;
		} else {
			if(aa > bb) {
				return 1;
			} else {
				return 0;
			}
		}
	});
	for(t=0; t<tiddlers.length; t++) {
		titles.push(tiddlers[t].fields.title);
	}
	return titles;
};

exports.countTiddlers = function(excludeTag) {
	var tiddlers = this.getTiddlers(null,excludeTag);
	return $tw.utils.count(tiddlers);
};

/*
Sort an array of tiddler titles by a specified field
	titles: array of titles (sorted in place)
	sortField: name of field to sort by
	isDescending: true if the sort should be descending
	isCaseSensitive: true if the sort should consider upper and lower case letters to be different
*/
exports.sortTiddlers = function(titles,sortField,isDescending,isCaseSensitive) {
	var self = this;
	titles.sort(function(a,b) {
		if(sortField !== "title") {
			a = self.getTiddler(a).fields[sortField] || "";
			b = self.getTiddler(b).fields[sortField] || "";
		}
		if(!isCaseSensitive) {
			if(typeof a === "string") {
				a = a.toLowerCase();
			}
			if(typeof b === "string") {
				b = b.toLowerCase();
			}
		}
		if(a < b) {
			return isDescending ? +1 : -1;
		} else {
			if(a > b) {
				return isDescending ? -1 : +1;
			} else {
				return 0;
			}
		}
	});
};

exports.forEachTiddler = function(/* [sortField,[excludeTag,]]callback */) {
	var arg = 0,
		sortField = arguments.length > 1 ? arguments[arg++] : null,
		excludeTag = arguments.length > 2 ? arguments[arg++] : null,
		callback = arguments[arg++],
		titles = this.getTiddlers(sortField,excludeTag),
		t, tiddler;
	for(t=0; t<titles.length; t++) {
		tiddler = this.tiddlers[titles[t]];
		if(tiddler) {
			callback.call(this,tiddler.fields.title,tiddler);
		}
	}
};

/*
Return an array of tiddler titles that are directly linked from the specified tiddler
*/
exports.getTiddlerLinks = function(title) {
	var self = this;
	// We'll cache the links so they only get computed if the tiddler changes
	return this.getCacheForTiddler(title,"links",function() {
		// Parse the tiddler
		var parser = self.parseTiddler(title);
		// Count up the links
		var links = [],
			checkParseTree = function(parseTree) {
				for(var t=0; t<parseTree.length; t++) {
					var parseTreeNode = parseTree[t];
					if(parseTreeNode.type === "element" && parseTreeNode.tag === "$link" && parseTreeNode.attributes.to.type === "string") {
						var value = parseTreeNode.attributes.to.value;
						if(links.indexOf(value) === -1) {
							links.push(value);
						}
					}
					if(parseTreeNode.children) {
						checkParseTree(parseTreeNode.children);
					}
				}
			};
		if(parser) {
			checkParseTree(parser.tree);
		}
		return links;
	});
};

/*
Return an array of tiddler titles that link to the specified tiddler
*/
exports.getTiddlerBacklinks = function(targetTitle) {
	var self = this,
		backlinks = [];
	this.forEachTiddler(function(title,tiddler) {
		var links = self.getTiddlerLinks(title);
		if(links.indexOf(targetTitle) !== -1) {
			backlinks.push(title);
		}
	});
	return backlinks;
};

/*
Return a hashmap of tiddler titles that are referenced but not defined. Each value is the number of times the missing tiddler is referenced
*/
exports.getMissingTitles = function() {
	var self = this,
		missing = [];
// We should cache the missing tiddler list, even if we recreate it every time any tiddler is modified
	this.forEachTiddler(function(title,tiddler) {
		var links = self.getTiddlerLinks(title);
		$tw.utils.each(links,function(link) {
			if((!self.tiddlerExists(link) && !self.isShadowTiddler(link)) && missing.indexOf(link) === -1) {
				missing.push(link);
			}
		});
	});
	return missing;
};

exports.getOrphanTitles = function() {
	var self = this,
		orphans = this.getTiddlers();
	this.forEachTiddler(function(title,tiddler) {
		var links = self.getTiddlerLinks(title);
		$tw.utils.each(links,function(link) {
			var p = orphans.indexOf(link);
			if(p !== -1) {
				orphans.splice(p,1);
			}
		});
	});
	return orphans; // Todo
};

exports.getSystemTitles = function() {
	var titles = [];
	for(var title in this.tiddlers) {
		if(this.isSystemTiddler(title)) {
			titles.push(title);
		}
	}
	titles.sort();
	return titles;
};

exports.getShadowTitles = function() {
	var titles = [];
	for(var title in this.shadowTiddlers) {
		titles.push(title);
	}
	titles.sort();
	return titles;
};

/*
Retrieves a list of the tiddler titles that are tagged with a given tag
*/
exports.getTiddlersWithTag = function(tag) {
	// Get the list associated with the tag
	var titles = [];
	for(var title in this.tiddlers) {
		var tiddler = this.tiddlers[title];
		if($tw.utils.isArray(tiddler.fields.tags) && tiddler.fields.tags.indexOf(tag) !== -1) {
			titles.push(title);
		}
	}
	return this.sortByList(titles,tag);
};

/*
Lookup a given tiddler and return a list of all the tiddlers that include it in their list
*/
exports.findListingsOfTiddler = function(targetTitle) {
	// Get the list associated with the tag
	var titles = [];
	for(var title in this.tiddlers) {
		var tiddler = this.tiddlers[title];
		if($tw.utils.isArray(tiddler.fields.list) && tiddler.fields.list.indexOf(targetTitle) !== -1) {
			titles.push(title);
		}
	}
	return titles;
};

/*
Sorts an array of tiddler titles according to an ordered list
*/
exports.sortByList = function(array,listTitle) {
	var list = this.getTiddlerList(listTitle);
	if(list) {
		var titles = [], t, title;
		// First place any entries that are present in the list
		for(t=0; t<list.length; t++) {
			title = list[t];
			if(array.indexOf(title) !== -1) {
				titles.push(title);
			}
		}
		// Then place any remaining entries
		for(t=0; t<array.length; t++) {
			title = array[t];
			if(list.indexOf(title) === -1) {
				titles.push(title);
			}
		}
		return titles;
	} else {
		return array;
	}
};

/*
Retrieve a tiddler as a JSON string of the fields
*/
exports.getTiddlerAsJson = function(title) {
	var tiddler = this.getTiddler(title);
	if(tiddler) {
		var fields = {};
		$tw.utils.each(tiddler.fields,function(value,name) {
			fields[name] = tiddler.getFieldString(name);
		});
		return JSON.stringify(fields);
	} else {
		return JSON.stringify({title: title});
	}
};

/*
Get a tiddlers content as a JavaScript object. How this is done depends on the type of the tiddler:

application/json: the tiddler JSON is parsed into an object
application/x-tiddler-dictionary: the tiddler is parsed as sequence of name:value pairs

Other types currently just return null.
*/
exports.getTiddlerData = function(title,defaultData) {
	var tiddler = this.getTiddler(title),
		data;
	if(tiddler && tiddler.fields.text) {
		switch(tiddler.fields.type) {
			case "application/json":
				// JSON tiddler
				try {
					data = JSON.parse(tiddler.fields.text);
				} catch(ex) {
					return defaultData;
				}
				return data;
			case "application/x-tiddler-dictionary":
				return $tw.utils.parseFields(tiddler.fields.text);
		}
	}
	return defaultData;
};

/*
Extract an indexed field from within a data tiddler
*/
exports.extractTiddlerDataItem = function(title,index,defaultText) {
	var data = this.getTiddlerData(title,{}),
		text;
	if(data && $tw.utils.hop(data,index)) {
		text = data[index];
	}
	if(typeof text === "string" || typeof text === "number") {
		return text.toString();
	} else {
		return defaultText;
	}
};

/*
Set a tiddlers content to a JavaScript object. Currently this is done by setting the tiddler's type to "application/json" and setting the text to the JSON text of the data.
*/
exports.setTiddlerData = function(title,data) {
	var tiddler = this.getTiddler(title);
	this.addTiddler(new $tw.Tiddler(tiddler,{title: title, type: "application/json", text: JSON.stringify(data,null,$tw.config.preferences.jsonSpaces)},this.getModificationFields()));
};

/*
Return the content of a tiddler as an array containing each line
*/
exports.getTiddlerList = function(title) {
	var tiddler = this.getTiddler(title);
	if(tiddler && $tw.utils.isArray(tiddler.fields.list)) {
		return tiddler.fields.list;
	}
	return [];
};

// Return the named cache object for a tiddler. If the cache doesn't exist then the initializer function is invoked to create it
exports.getCacheForTiddler = function(title,cacheName,initializer) {
	this.caches = this.caches || {};
	var caches = this.caches[title];
	if(caches && caches[cacheName]) {
		return caches[cacheName];
	} else {
		if(!caches) {
			caches = {};
			this.caches[title] = caches;
		}
		caches[cacheName] = initializer();
		return caches[cacheName];
	}
};

// Clear all caches associated with a particular tiddler
exports.clearCache = function(title) {
	this.caches = this.caches || {};
	if($tw.utils.hop(this.caches,title)) {
		delete this.caches[title];
	}
};

exports.initParsers = function(moduleType) {
	// Install the parser modules
	$tw.Wiki.parsers = {};
	var self = this;
	$tw.modules.forEachModuleOfType("parser",function(title,module) {
		for(var f in module) {
			if($tw.utils.hop(module,f)) {
				$tw.Wiki.parsers[f] = module[f]; // Store the parser class
			}
		}
	});
};

/*
Parse a block of text of a specified MIME type
	type: content type of text to be parsed
	text: text
	options: see below
Options include:
	parseAsInline: if true, the text of the tiddler will be parsed as an inline run
*/
exports.parseText = function(type,text,options) {
	options = options || {};
	// Select a parser
	var Parser = $tw.Wiki.parsers[type];
	if(!Parser && $tw.config.fileExtensionInfo[type]) {
		Parser = $tw.Wiki.parsers[$tw.config.fileExtensionInfo[type].type];
	}
	if(!Parser) {
		Parser = $tw.Wiki.parsers[options.defaultType || "text/vnd.tiddlywiki"];
	}
	if(!Parser) {
		return null;
	}
	// Return the parser instance
	return new Parser(type,text,{
		parseAsInline: options.parseAsInline,
		wiki: this
	});
};

/*
Parse a tiddler according to its MIME type
*/
exports.parseTiddler = function(title,options) {
	options = options || {};
	var cacheType = options.parseAsInline ? "newInlineParseTree" : "newBlockParseTree",
		tiddler = this.getTiddler(title),
		self = this;
	return tiddler ? this.getCacheForTiddler(title,cacheType,function() {
			return self.parseText(tiddler.fields.type,tiddler.fields.text,options);
		}) : null;
};

/*
Parse text in a specified format and render it into another format
	outputType: content type for the output
	textType: content type of the input text
	text: input text
*/
exports.renderText = function(outputType,textType,text,context) {
	var parser = this.parseText(textType,text),
		renderTree = new $tw.WikiRenderTree(parser,{wiki: this, context: context, document: $tw.document});
	renderTree.execute();
	var container = $tw.document.createElement("div");
	renderTree.renderInDom(container)
	return outputType === "text/html" ? container.innerHTML : container.textContent;
};

/*
Parse text from a tiddler and render it into another format
	outputType: content type for the output
	title: title of the tiddler to be rendered
*/
exports.renderTiddler = function(outputType,title,context) {
	var parser = this.parseTiddler(title),
		renderTree = new $tw.WikiRenderTree(parser,{wiki: this, context: context, document: $tw.document});
	renderTree.execute();
	var container = $tw.document.createElement("div");
	renderTree.renderInDom(container)
	return outputType === "text/html" ? container.innerHTML : container.textContent;
};

/*
Select the appropriate saver modules and set them up
*/
exports.initSavers = function(moduleType) {
	moduleType = moduleType || "saver";
	// Instantiate the available savers
	this.savers = [];
	var self = this;
	$tw.modules.forEachModuleOfType(moduleType,function(title,module) {
		if(module.canSave(self)) {
			self.savers.push(module.create(self));
		}
	});
	// Sort the savers into priority order
	this.savers.sort(function(a,b) {
		if(a.info.priority < b.info.priority) {
			return -1;
		} else {
			if(a.info.priority > b.info.priority) {
				return +1;
			} else {
				return 0;
			}
		}
	});
};

/*
Invoke the highest priority saver that successfully handles a method
*/
exports.callSaver = function(method /*, args */ ) {
	for(var t=this.savers.length-1; t>=0; t--) {
		var saver = this.savers[t];
		if(saver[method].apply(saver,Array.prototype.slice.call(arguments,1))) {
			return true;
		}
	}
	return false;
};

/*
Save the wiki contents. Options are:
	template: the tiddler containing the template to save
	downloadType: the content type for the saved file
*/
exports.saveWiki = function(options) {
	options = options || {};
	var template = options.template || "$:/core/templates/tiddlywiki5.template.html",
		downloadType = options.downloadType || "text/plain";
	var text = this.renderTiddler(downloadType,template);
	this.callSaver("save",text,function(err) {
		$tw.notifier.display("$:/messages/Saved");
	});
};

/*
Return an array of tiddler titles that match a search string
	text: The text string to search for
	options: see below
Options available:
	titles:  Hashmap or array of tiddler titles to limit search
	exclude: An array of tiddler titles to exclude from the search
	invert: If true returns tiddlers that do not contain the specified string
	caseSensitive: If true forces a case sensitive search
	literal: If true, searches for literal string, rather than separate search terms
*/
exports.search = function(text,options) {
	options = options || {};
	var self = this,t;
	// Convert the search string into a regexp for each term
	var terms, searchTermsRegExps,
		flags = options.caseSensitive ? "" : "i";
	if(options.literal) {
		if(text.length === 0) {
			searchTermsRegExps = null;
		} else {
			searchTermsRegExps = [new RegExp("(" + $tw.utils.escapeRegExp(text) + ")",flags)];
		}
	} else {
		terms = text.replace(/( +)/g," ").split(" ");
		if(terms.length === 1 && terms[0] === "") {
			searchTermsRegExps = null;
		} else {
			searchTermsRegExps = [];
			for(t=0; t<terms.length; t++) {
				searchTermsRegExps.push(new RegExp("(" + $tw.utils.escapeRegExp(terms[t]) + ")",flags));
			}
		}
	}
	// Function to check a given tiddler for the search term
	var searchTiddler = function(title) {
		if(!searchTermsRegExps) {
			return !options.invert;
		}
		var tiddler = self.getTiddler(title);
		if(!tiddler) {
			tiddler = new $tw.Tiddler({title: title, text: "", type: "text/vnd.tiddlywiki"});
		}
		var contentTypeInfo = $tw.config.contentTypeInfo[tiddler.fields.type];
		if(contentTypeInfo ? contentTypeInfo.encoding === "utf8" : true) {
			var match = true;
			for(var t=0; t<searchTermsRegExps.length; t++) {
				// Search title and body
				if(match) {
					match = searchTermsRegExps[t].test(tiddler.fields.title) || searchTermsRegExps[t].test(tiddler.fields.text);
				}
			}
			return options.invert ? !match : match;
		}
		return false;			
	};
	// Loop through all the tiddlers doing the search
	var results = [];
	if($tw.utils.isArray(options.titles)) {
		for(t=0; t<options.titles.length; t++) {
			if(searchTiddler(options.titles[t])) {
				results.push(options.titles[t]);
			}
		}
	} else {
		var source = options.titles || this.tiddlers;
		for(t in source) {
			if(searchTiddler(t)) {
				results.push(t);
			}
		}
	}
	// Remove any of the results we have to exclude
	if(options.exclude) {
		for(t=0; t<options.exclude.length; t++) {
			var p = results.indexOf(options.exclude[t]);
			if(p !== -1) {
				results.splice(p,1);
			}
		}
	}
	return results;
};

/*
Trigger a load for a tiddler if it is skinny. Returns the text, or undefined if the tiddler is missing, null if the tiddler is being lazily loaded.
*/
exports.getTiddlerText = function(title,defaultText) {
	var tiddler = this.getTiddler(title);
	// Return undefined if the tiddler isn't found
	if(!tiddler) {
		return defaultText;
	}
	if(tiddler.fields.text !== undefined) {
		// Just return the text if we've got it
		return tiddler.fields.text;
	} else {
		// Tell any listeners about the need to lazily load this tiddler
		this.dispatchEvent("lazyLoad",title);
		// Indicate that the text is being loaded
		return null;
	}
};

})();
