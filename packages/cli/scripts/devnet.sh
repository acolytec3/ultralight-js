#!/bin/sh
set -e

node ../proxy/dist/index.js --nat=localhost &
sleep 3
counter=1
while [ $counter -le $1 ]
do
  port=$((8545+$counter))
  metrics=$((18545 + $counter))
  node dist/index.js --nat=localhost --proxy=false --rpc --rpcPort=$port --metrics=true --metricsPort=$metrics &
  counter=$(($counter+1))
done

sleep infinity

trap "trap - SIGTERM && kill -- -$$" SIGINT SIGTERM EXIT