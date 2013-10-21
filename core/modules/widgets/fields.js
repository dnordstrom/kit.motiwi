/*\
title: $:/core/modules/widgets/fields.js
type: application/javascript
module-type: widget

The fields widget displays the fields of a tiddler through a text substitution template.

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var FieldsWidget = function(renderer) {
	// Save state
	this.renderer = renderer;
	// Generate child nodes
	this.generate();
};

FieldsWidget.prototype.generate = function() {
	// Get parameters from our attributes
	this.tiddlerTitle = this.renderer.getAttribute("tiddler",this.renderer.tiddlerTitle);
	this.template = this.renderer.getAttribute("template");
	this.exclude = this.renderer.getAttribute("exclude");
	this.stripTitlePrefix = this.renderer.getAttribute("stripTitlePrefix","no") === "yes";
	// Get the tiddler we're displaying
	var tiddler = this.renderer.renderTree.wiki.getTiddler(this.tiddlerTitle);
	// Get the exclusion list
	var exclude;
	if(this.exclude) {
		exclude = this.exclude.split(" ");
	} else {
		exclude = ["text"]; 
	}
	// Compose the template
	var text = [];
	if(this.template && tiddler) {
		var fields = [];
		for(var fieldName in tiddler.fields) {
			if(exclude.indexOf(fieldName) === -1) {
				fields.push(fieldName);
			}
		}
		fields.sort();
		for(var f=0; f<fields.length; f++) {
			fieldName = fields[f];
			if(exclude.indexOf(fieldName) === -1) {
				var row = this.template,
					value = tiddler.getFieldString(fieldName);
				if(this.stripTitlePrefix && fieldName === "title") {
					var reStrip = /^\{[^\}]+\}(.+)/mg,
						reMatch = reStrip.exec(value);
					if(reMatch) {
						value = reMatch[1];
					}
				}
				row = row.replace("$name$",fieldName);
				row = row.replace("$value$",value);
				row = row.replace("$encoded_value$",$tw.utils.htmlEncode(value));
				text.push(row)
			}
		}
	}
	// Set the element
	this.tag = "pre";
	this.attributes = {
		"class": "tw-fields"
	};
	// Set up the attributes for the wrapper element
	var classes = [];
	if(this.renderer.hasAttribute("class")) {
		$tw.utils.pushTop(classes,this.renderer.getAttribute("class").split(" "));
	}
	if(classes.length > 0) {
		this.attributes["class"] = classes.join(" ");
	}
	if(this.renderer.hasAttribute("style")) {
		this.attributes.style = this.renderer.getAttribute("style");
	}
	if(this.renderer.hasAttribute("tooltip")) {
		this.attributes.title = this.renderer.getAttribute("tooltip");
	}
	// Create the renderers for the wrapper and the children
	this.children = this.renderer.renderTree.createRenderers(this.renderer,[{
		type: "text",
		text: text.join("")
	}]);
};

exports.fields = FieldsWidget;

})();
