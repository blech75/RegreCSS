RegreCSS (a.k.a. "cssdiff")
===========================

RegreCSS is a tool that diffs the computed style of DOM nodes between two similar HTML documents.

Currently a proof-of-concept, this tool/algorithm will compare the computed styles of two documents' nodes and report on the differences. In other words: RegreCSS will determine if there any CSS differences between two identical HTML docs with slightly different CSS rules. (Think: `getComputedStyle()` on every single node.) This can be particularly useful when regression testing CSS to ensure that a seemingly minor CSS change does adversely affect unintended elements on a page, or even the entire site (when used in batch mode).

Background
----------
At my day job it's not uncommon for us to produce many dozens of front-end pages/templates for a single project. Over the course of the project it usually becomes necessary to adjust some core CSS rules (those at the top of the cascade) to accommodate a new variant of content/design. After many pages are been coded, we need to confirm that the newly-tweaked CSS only the desired elements. Visual comparison is tedious and usually 


Notes
-----
 * Everything (code, functionality, UI) is very much in a pre-alpha state right now and will definitely be changing. The idea is to release early and often (cross your fingers).
 * All of the output is currently done via `console.log()`, so make sure you're got one of those in your browser. An actual in-browser UI is coming Real Soon Now (see above).
 * The HTML and DOM structure of the pages you're comparing should be identical down to the content. The use case doesn't really make sense if they're not. Think about it.
 * Animated JS elements that start on page load present a challenge and are not accounted for. See KNOWN ISSUES in `regrecss.js`.
 * Vendor prefixes are being ignored now; it'll be an easily configurable option in the future.


How to Use
----------
 * Check out two copies of your codebase in your local web server's docroot, each at a different revision/tag/branch/etc.
 * Drop the `regrecss` folder in your local web server's docroot and hit it up over HTTP.
 * Ensure your browser's webdev tools are enabled and visible (Firebug, Web Inspector, etc.)
 * Copy/paste the URLs of the two versions of the file into `regrecss`'s URL fields and click 'RegreCSS!'.


Future Direction
----------------
 * More configuration options.
 * Command-line interface to allow for automation. (Think headless browser.)


License
-------
`RegreCSS` is licensed under the terms of the MIT License, see the included LICENSE file.
