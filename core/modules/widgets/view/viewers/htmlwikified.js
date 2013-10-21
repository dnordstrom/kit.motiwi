/*\
title: $:/core/modules/widgets/view/viewers/htmlwikified.js
type: application/javascript
module-type: fieldviewer

A viewer for viewing tiddler fields as a textual HTML representation of the wikified text

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var HtmlWikifiedViewer = function(viewWidget,tiddler,field,value) {
	this.viewWidget = viewWidget;
	this.tiddler = tiddler;
	this.field = field;
	this.value = value;
};

HtmlWikifiedViewer.prototype.render = function() {
	// Parse the field text
	var wiki = this.viewWidget.renderer.renderTree.wiki,
		parser = wiki.parseText("text/vnd.tiddlywiki",this.value),
		renderTree = new $tw.WikiRenderTree(parser,{wiki: wiki, parentRenderer: this.viewWidget.renderer, document: this.viewWidget.renderer.renderTree.document});
	renderTree.execute();
	var container = this.viewWidget.renderer.renderTree.document.createElement("div");
	renderTree.renderInDom(container)
	var text = container.innerHTML;
	// Set the element details
	this.viewWidget.tag = "pre";
	this.viewWidget.attributes = {
		"class": "tw-view-htmlwikified"
	};
	this.viewWidget.children = this.viewWidget.renderer.renderTree.createRenderers(this.viewWidget.renderer,[{
			type: "text",
			text: text
		}]);
};

exports.htmlwikified = HtmlWikifiedViewer;

})();
