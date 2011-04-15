function diffNodes() {
	var IGNORE_REGEX = /^-(webkit|ms|moz)/;

	var doc1 = document.getElementById('doc1');
	var doc2 = document.getElementById('doc2');

	var doc1_els = _.toArray(doc1.contentDocument.body.getElementsByTagName('*'));
	var doc2_els = _.toArray(doc2.contentDocument.body.getElementsByTagName('*'));

	var css_props = null;

	for (var i=0; i < doc1_els.length; i++) {
		console.log(doc1_els[i].nodeName + ((doc1_els[i].id != "") ? "#" + doc1_els[i].id : "") + ((doc1_els[i].className != "") ? "." + doc1_els[i].className : "") );

		var el1_style = doc1.contentDocument.defaultView.getComputedStyle(doc1_els[i]);
		var el2_style = doc2.contentDocument.defaultView.getComputedStyle(doc2_els[i]);

		// memoize all of the CSS props on the first iteration
		css_props = css_props || _.toArray(el1_style);

		_.each(css_props, function(prop){
			if (IGNORE_REGEX.test(prop)) return;

			if (el1_style[prop] != el2_style[prop]) {
				console.log(" > " + prop + " : " + el1_style[prop] + " vs. " + el2_style[prop]);
			}
		});
		
	};

};


window.addEventListener('load', function(){
	document.getElementById('diff-css').addEventListener('click', diffNodes);
});
