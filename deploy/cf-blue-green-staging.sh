#!/bin/bash

set -e

# Use the URL to a Debian 64 bit installer select from here:
# https://github.com/cloudfoundry/cli/releases
# This is the source file after following the redirect
wget https://s3-us-west-1.amazonaws.com/cf-cli-releases/releases/v6.25.0/cf-cli-installer_6.25.0_x86-64.deb -qO temp.deb && sudo dpkg -i temp.deb

rm temp.deb

cf api $CF_STAGING_API
cf login -u $CF_STAGING_USERNAME -p $CF_STAGING_PASSWORD -o $CF_STAGING_ORG -s $CF_STAGING_SPACE

# Get path to script directory: http://stackoverflow.com/a/4774063
pushd `dirname $0` > /dev/null
SCRIPTPATH=`pwd`
popd > /dev/null

export B_DOMAIN=$CF_STAGING_DOMAIN

$SCRIPTPATH/cf-blue-green.sh $CF_STAGING_APP

cf logout
