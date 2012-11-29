#!/bin/bash

if [ $# -ne 2 ] ; then
  echo "Usage: `basename $0` url1 url2" >&2
  exit 1
fi

phantomjs `pwd`/cssdiff.phantom.js $1 $2
