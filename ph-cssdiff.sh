#!/bin/bash

# allow DEBUG env varialbe to trigger simple bash debugging when it is set to 
# anything but 'false'
if [ ${DEBUG:=false} != 'false' ] ; then
  set -x
fi

# so... i have a symlink from my ~/bin dir (in my PATH) to the directory where 
# cssdiff lives. i'd like to be able to use the script from anywhere, but 
# phantomjs (also in my PATH) requires a path to the JS file, which i don't 
# immediately know becuase i'm two steps removed from where the actual 
# cssdiff files are: current dir -> ~/bin (via PATH) -> cssdiff location. so 
# i've cobbled together a combo of `dirname` and `stat` to figure things out.
# not sure if this is standard/normal bash stuff, but it seems to work well, 
# either called from a symlink or the actual script. maybe this will be solved
# via a proper installation technique. need to think about it more.

# absolute path to this actual shell script (not the symlink)
FULLY_RESOLVED_PATH=`dirname $0`/`stat -f %Y $0`

# absolute path to cssdiff dir
CSSDIFF_HOME=`dirname $FULLY_RESOLVED_PATH`


# simple sanity check
# FIXME: improve this in the future
if [ $# -ne 2 ] ; then
  echo "Usage: `basename $0` url1 url2" >&2
  exit 1
fi


### set some vars to make the cmd line easier to read
#
# absolute path to cssdiff script
CSSDIFF_PATH=$CSSDIFF_HOME/cssdiff.phantom.js
#
# possibly also use "--local-to-remote-url-access=yes"
PHANTOM_OPTIONS="--web-security=no"

# ok, run it!
phantomjs $PHANTOM_OPTIONS $CSSDIFF_PATH $1 $2
