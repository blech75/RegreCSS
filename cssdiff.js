function diffNodes() {
	var doc1 = document.getElementById('doc1');
	var doc2 = document.getElementById('doc2');

	var doc1_els = doc1.contentDocument.body.getElementsByTagName('*');
	var doc2_els = doc2.contentDocument.body.getElementsByTagName('*');

	var css_props = null;

	_.each(doc1_els, function(el){
		el_style = doc1.contentDocument.defaultView.getComputedStyle(el);
		css_props = css_props || _.toArray(el_style);

		_.each(css_props, function(prop){
			console.log(prop + " : " + el_style[prop]);
		});
		
	});

};


window.addEventListener('load', function(){
	document.getElementById('diff-css').addEventListener('click', diffNodes);
});
