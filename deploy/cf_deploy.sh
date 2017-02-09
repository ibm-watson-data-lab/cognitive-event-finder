#!/usr/bin/env bash
./cf_setenv.sh
pushd ../
cf push
popd
while read -r line; do
	param_name=$(echo $line | sed 's/\(^.*\)\=.*$/\1/')
	if [ -n "$param_name" ]
	then
		param_value=$(echo $line | sed 's/^.*\=[ ]*\(.*\)$/\1/')
		cf_setenv_cmd=$(echo cf set-env cognitive-event-finder $param_name $param_value)
        echo $cf_setenv_cmd
		eval $cf_setenv_cmd
	fi
done <<< "$(cat ./.env)"
cf restage cognitive-event-finder
