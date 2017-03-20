#!/bin/bash

set -e

# Use the URL to a Debian 64 bit installer select from here:
# https://github.com/cloudfoundry/cli/releases
# This is the source file after following the redirect
wget https://s3.amazonaws.com/go-cli/releases/v6.12.4/cf-cli_amd64.deb -qO temp.deb && sudo dpkg -i temp.deb

rm temp.deb

cf api $CF_PROD_API
cf login --u $CF_PROD_USERNAME --p $CF_PROD_PASSWORD --o $CF_PROD_ORG--s $CF_PROD_SPACE

# Get path to script directory: http://stackoverflow.com/a/4774063
pushd `dirname $0` > /dev/null
SCRIPTPATH=`pwd`
popd > /dev/null

export B_DOMAIN=$CF_PROD_DOMAIN

$SCRIPTPATH/cf-blue-green.sh $CF_PROD_APP

cf logout
