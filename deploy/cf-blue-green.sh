#!/bin/bash

# Blue-green deployment script. Usage:
#
#   ./cf-blue-green <appname>

set -e
set -o pipefail
set -x


if [ $# -ne 1 ]; then
	echo "Usage:\n\n\t./cf-blue-green <appname>\n"
	exit 1
fi


BLUE=$1
GREEN="${BLUE}-B"


finally ()
{
  # we don't want to keep the sensitive information around
  rm $MANIFEST
}

on_fail () {
  finally
  echo "DEPLOY FAILED - you may need to check 'cf apps' and 'cf routes' and do manual cleanup"
}


# pull the up-to-date manifest from the BLUE (existing) application
MANIFEST=$(mktemp -t "${BLUE}_manifest.XXXXXXXXXX")
cf create-app-manifest $BLUE -p $MANIFEST

# set up try/catch
# http://stackoverflow.com/a/185900/358804
trap on_fail ERR

DOMAIN=${B_DOMAIN:-$(cat $MANIFEST | grep domain: | awk '{print $2}')}

# create the GREEN application
cf push $GREEN -f $MANIFEST -n $GREEN
# ensure it starts
sleep 10
curl --fail -I "https://${GREEN}.${DOMAIN}"

# add the GREEN application to each BLUE route to be load-balanced
# TODO this output parsing seems a bit fragile...find a way to use more structured output
#cf routes | tail -n +4 | grep "$BLUE$" | awk '{print $3" -n "$2}' | xargs -n 3 cf map-route $GREEN

# get GREEN urls to remove later
urlString=$(cf app $GREEN | grep urls | cut -d':' -f 2)
IFS=', ' read -r -a greenUrls <<< "$urlString"

# get BLUE urls
# map GREEN to BLUE
# unmap BLUE
urlString=$(cf app $BLUE | grep urls | cut -d':' -f 2)
IFS=', ' read -r -a blueUrls <<< "$urlString"
for url in "${blueUrls[@]}"
do
   IFS='.' read -r -a urlParts <<< "$url"
   if [ ${#urlParts[@]} = 2 ]; then
      cf map-route $GREEN $url
      cf unmap-route $BLUE $url
   else
      cf map-route $GREEN ${urlParts[1]}.${urlParts[2]} --hostname ${urlParts[0]}
      cf unmap-route $BLUE ${urlParts[1]}.${urlParts[2]} --hostname ${urlParts[0]}
   fi
done

# unmap GREEN routes
for url in "${greenUrls[@]}"
do
   IFS='.' read -r -a urlParts <<< "$url"
   if [ ${#urlParts[@]} = 2 ]; then
      cf unmap-route $GREEN $url
      cf delete-route $url
   else
      cf unmap-route $GREEN ${urlParts[1]}.${urlParts[2]} --hostname ${urlParts[0]}
      cf delete-route ${urlParts[1]}.${urlParts[2]} --hostname ${urlParts[0]}
   fi
done

# cleanup
# TODO consider 'stop'-ing the BLUE instead of deleting it, so that depedencies are cached for next time
#cf delete $BLUE -f
cf stop $BLUE
cf rename $BLUE "$BLUE-deleted"
cf rename $GREEN $BLUE
#cf delete-route $DOMAIN -n $GREEN -f
finally

echo "DONE"
