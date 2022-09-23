import { CopyIcon } from '@chakra-ui/icons'
import {
  Box,
  Button,
  Divider,
  GridItem,
  Heading,
  HStack,
  Input,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Tooltip,
  Tr,
  VStack,
} from '@chakra-ui/react'
import { ENR, HistoryNetworkContentTypes, shortId } from 'portalnetwork'
import React, { useContext, useEffect, useReducer, useState } from 'react'
import { AppContext, AppContextType, StateChange } from '../globalReducer'
import { PeerActions } from '../peerActions'
import { PeerContext, PeerContextType, PeerStateChange } from '../peerReducer'

export default function PeerButtons() {
  const { state, dispatch } = useContext(AppContext as React.Context<AppContextType>)
  const { peerState, peerDispatch } = useContext(PeerContext as React.Context<PeerContextType>)
  const peerActions = new PeerActions(
    {
      peerState,
      peerDispatch,
    },
    state.provider!.historyProtocol
  )

  useEffect(() => {
    if (!state.selectedPeer) {
      dispatch({ type: StateChange.SETSELECTEDPEER, payload: { idx: 0 } })
    }
  }, [])

  const peerIdx = state.sortedPeers
    .map((peer) => {
      return peer[1][3]
    })
    .indexOf(state.selectedPeer)

  const sendFindContent = async (type: string) => {
    const block = await peerActions.sendFindContent(type, state!.selectedPeer)
    if (block) {
      dispatch!({ type: StateChange.SETBLOCK, payload: block })
    }
  }

  return (
    <GridItem>
      {state && state.provider && (
        <Box border={'1px'}>
          <VStack>
            <HStack>
              <VStack>
                <VStack>
                  <Heading size={'md'}>
                    Peer {peerIdx + 1} / {state!.peers.length}
                  </Heading>
                  <Text size={'sm'} color={'gray.500'}>
                    {state.selectedPeer.slice(0, 20)}...
                  </Text>
                </VStack>
                <Table size="xs">
                  {state.sortedPeers[peerIdx] && (
                    <Tbody>
                      <Tr>
                        <Td>ENR:</Td>
                        <Th>
                          <Tooltip label={state.sortedPeers[peerIdx][1][3]}>
                            <CopyIcon
                              cursor={'pointer'}
                              onClick={() =>
                                navigator.clipboard.writeText(state.sortedPeers[peerIdx][1][3])
                              }
                            />
                          </Tooltip>
                        </Th>
                      </Tr>
                      <Tr>
                        <Td>Addr: </Td>
                        <Td>
                          {state.sortedPeers[peerIdx][1][0]}: {state.sortedPeers[peerIdx][1][1]}
                        </Td>
                      </Tr>
                      <Tr>
                        <Td>NodeId: </Td>
                        <Td>{shortId(ENR.decodeTxt(state.selectedPeer).nodeId)}</Td>
                      </Tr>
                    </Tbody>
                  )}
                </Table>
              </VStack>
              <Button
                size="lg"
                onClick={() => peerActions.handlePing(state.selectedPeer)}
                bgColor={peerState.ping[0]}
              >
                {peerState.ping[1]}
              </Button>
            </HStack>
            <Button
              width="100%"
              onClick={() => peerActions.handleRequestSnapshot(state!.selectedPeer)}
            >
              Request Accumulator Snapshot
            </Button>
            <Divider />
            <HStack width={'100%'}>
              <Button
                isDisabled={state.provider.historyProtocol.accumulator.historicalEpochs.length < 1}
                width="70%"
                onClick={() => sendFindContent('epoch')}
              >
                Request Epoch Accumulator by Epoch
              </Button>
              <Input
                type={'number'}
                min={1}
                max={state.provider.historyProtocol.accumulator.historicalEpochs.length}
                width={'30%'}
                placeholder={'Epoch'}
                onChange={(evt) => {
                  peerDispatch({
                    type: PeerStateChange.SETEPOCH,
                    payload: parseInt(evt.target.value),
                  })
                }}
              />
            </HStack>
            <Divider />
            <HStack width={'100%'}>
              <Button
                isDisabled={state.provider.historyProtocol.accumulator.historicalEpochs.length < 1}
                width="70%"
                onClick={() => sendFindContent('epoch')}
              >
                Request Epoch Accumulator by BlockNumber
              </Button>
              <Input
                type={'number'}
                min={1}
                max={state.provider.historyProtocol.accumulator.currentHeight()}
                width={'30%'}
                placeholder={`BlockNumber (Max: ${state.provider.historyProtocol.accumulator.currentHeight()})`}
                onChange={(evt) => {
                  peerDispatch({
                    type: PeerStateChange.SETEPOCH,
                    payload: Math.floor(parseInt(evt.target.value) / 8192),
                  })
                }}
              />
            </HStack>
            <Divider />
            {state.selectedPeer && (
              <HStack width={'100%'}>
                <Button
                  width="70%"
                  onClick={() => peerActions.handleFindNodes(ENR.decodeTxt(state!.selectedPeer))}
                >
                  FindNodes
                </Button>
                <Input
                  width={'30%'}
                  placeholder={'Distance'}
                  onChange={(evt) => {
                    peerDispatch({
                      type: PeerStateChange.SETDISTANCE,
                      payload: evt.target.value,
                    })
                  }}
                />
              </HStack>
            )}
            <Divider />
            <Input
              value={peerState.blockHash}
              placeholder="BlockHash"
              onChange={(evt) =>
                peerDispatch({ type: PeerStateChange.SETBLOCKHASH, payload: evt.target.value })
              }
            />
            <HStack width={'100%'}>
              <Button
                width={'50%'}
                title={`Send FINDCONTENT to peer for BlockHeader: ${peerState.blockHash.slice(
                  0,
                  8
                )}...`}
                onClick={() => {
                  sendFindContent('header')
                }}
              >
                Find Header
              </Button>
              <Button
                width={'50%'}
                title={`Send FINDCONTENT to peer for BlockBody: ${peerState.blockHash.slice(
                  0,
                  8
                )}...`}
                onClick={() => {
                  sendFindContent('body')
                }}
              >
                Find Body
              </Button>
            </HStack>
            <HStack width={'100%'}>
              <Button
                width={'50%'}
                title="Add content to offer"
                onClick={() => {
                  peerActions.addToOffer(HistoryNetworkContentTypes.BlockHeader)
                }}
              >
                Offer Header
              </Button>
              <Button
                width={'50%'}
                title="Add content to offer"
                onClick={() => {
                  peerActions.addToOffer(HistoryNetworkContentTypes.BlockBody)
                }}
              >
                Offer Body
              </Button>
            </HStack>
            <Box width={'90%'} border={'1px'}>
              <Text textAlign={'center'}>OFFER: {peerState.offer.length} / 26</Text>
            </Box>
            <Button
              width={'100%'}
              title={`Send OFFER to peer with ${peerState.offer.length} pieces of content`}
              onClick={() => peerActions.handleOffer(state.selectedPeer)}
            >
              Send Offer
            </Button>
          </VStack>
        </Box>
      )}
    </GridItem>
  )
}
