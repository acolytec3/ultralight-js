import {
  Button,
  Divider,
  HStack,
  Input,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tooltip,
  Text,
  VStack,
  Box,
  StackDivider,
  Center,
} from '@chakra-ui/react'
import React, { Dispatch, SetStateAction } from 'react'
import { Block } from '@ethereumjs/block'
import { ENR } from '@chainsafe/discv5'
import HistoryNetwork from './HistoryNetwork'
import { ArrowLeftIcon, ArrowRightIcon, NotAllowedIcon } from '@chakra-ui/icons'
import { CapacitorGlobal } from '@capacitor/core'

interface LayoutProps {
  copy: () => Promise<void>
  onOpen: () => void
  enr: string
  peerEnr: string
  setPeerEnr: Dispatch<SetStateAction<string>>
  handleClick: () => Promise<void>
  invalidHash: boolean
  handleFindContent: (blockHash: string) => Promise<void | Block>
  contentKey: string
  setContentKey: Dispatch<SetStateAction<string>>
  findParent: (hash: string) => Promise<void>
  block: Block | undefined
  peers: ENR[] | undefined
  sortedDistList: [number, string[]][]
  capacitor: CapacitorGlobal
}

export default function Layout(props: LayoutProps) {
  const native = props.capacitor.isNativePlatform()
  return (
    <VStack spacing={4} divider={<StackDivider borderColor={'gray.200'} />}>
      <Tabs width={'100%'} size={'sm'}>
        <TabList style={{ scrollbarWidth: 'none' }} overflowX="auto">
          <Tab>History Network</Tab>
          <Tab isDisabled>
            State Network
            <NotAllowedIcon />{' '}
          </Tab>
          <Tab isDisabled>
            Transaction Gossip Network
            <NotAllowedIcon />{' '}
          </Tab>
          <Tab isDisabled>
            Header Gossip Network
            <NotAllowedIcon />{' '}
          </Tab>
          <Tab isDisabled>
            Canonical Indices Network
            <NotAllowedIcon />{' '}
          </Tab>
        </TabList>
        {native && (
          <Box shadow="md" width={`100%`} border={'1px'} borderColor="gray.200">
            <Tooltip label="click to copy">
              <Text
                padding={2}
                fontSize={'xs'}
                onClick={props.copy}
                wordBreak="break-all"
                cursor="pointer"
              >
                {props.enr}
              </Text>
            </Tooltip>
          </Box>
        )}
        <VStack paddingTop={2} spacing={1} align="stretch">
          {native ? (
            <Center>
              <VStack>
                <Button
                  isDisabled={!props.peerEnr.startsWith('enr:')}
                  width={'100%'}
                  onClick={props.handleClick}
                >
                  Connect To Node
                </Button>
                <Input
                  width={'100%'}
                  bg="whiteAlpha.800"
                  value={props.peerEnr}
                  placeholder={'Node ENR'}
                  onChange={(evt) => props.setPeerEnr(evt.target.value)}
                />
              </VStack>
            </Center>
          ) : (
            <HStack>
              <Button width={'100%'} onClick={props.handleClick}>
                Connect To Node
              </Button>
              <ArrowRightIcon />
              <Input
                bg="whiteAlpha.800"
                value={props.peerEnr}
                placeholder={'Node ENR'}
                onChange={(evt) => props.setPeerEnr(evt.target.value)}
              />
            </HStack>
          )}
          <Divider />
          {native || (
            <HStack>
              <Center>
                <Box
                  shadow="md"
                  width={native ? '25%' : '45%'}
                  border={'1px'}
                  borderColor="gray.200"
                >
                  <Tooltip label="click to copy">
                    <Text
                      padding={2}
                      fontSize={'xs'}
                      onClick={props.copy}
                      wordBreak="break-all"
                      cursor="pointer"
                    >
                      {props.enr}
                    </Text>
                  </Tooltip>
                </Box>
                <ArrowLeftIcon width={'10%'} />
                <Box width={native ? '25%' : '45%'}>
                  <Text fontSize={'xs'}>
                    This is the ENR (Ethereum Node Record) for this Portal Network node. To connect
                    to a network, enter a Bootnode ENR above.
                  </Text>
                </Box>
              </Center>
            </HStack>
          )}
        </VStack>
        {props.peers && props.peers.length > 0 && (
          <TabPanels>
            <TabPanel>
              <HistoryNetwork
                invalidHash={props.invalidHash}
                handleFindContent={props.handleFindContent}
                contentKey={props.contentKey}
                setContentKey={props.setContentKey}
                findParent={props.findParent}
                block={props.block}
                peers={props.peers}
                sortedDistList={props.sortedDistList}
              />
            </TabPanel>
            <TabPanel>State Network</TabPanel>
            <TabPanel>Transaction Gossip Network</TabPanel>
            <TabPanel>Header Gossip Network</TabPanel>
            <TabPanel>Canonical Indices Network</TabPanel>
          </TabPanels>
        )}
      </Tabs>
    </VStack>
  )
}
