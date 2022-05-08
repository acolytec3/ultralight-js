import {
  Divider,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  VStack,
  StackDivider,
  Heading,
} from '@chakra-ui/react'
import React, { Dispatch, SetStateAction, useEffect } from 'react'
import { Block } from '@ethereumjs/block'
import { ENR, PortalNetwork } from 'portalnetwork'
import HistoryNetwork from './HistoryNetwork'
import { NotAllowedIcon } from '@chakra-ui/icons'
import { CapacitorGlobal } from '@capacitor/core'
import Bootnodes from './Bootnodes'
import { useState } from 'react'
import { BrowserLevel } from 'browser-level'

interface LayoutProps {
  portal: PortalNetwork
  copy: () => Promise<void>
  onOpen: () => void
  LDB: BrowserLevel
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
  useEffect(() => {
    setTimeout(async () => {
      await props.handleClick()
    }, 2000)
  }, [])

  return (
    <VStack spacing={4} divider={<StackDivider borderColor={'gray.200'} />}>
      <Tabs width={'100%'} size={'sm'}>
        <TabList style={{ scrollbarWidth: 'none' }} overflowX="auto">
          <Tab>History Network</Tab>
          <Tab isDisabled>
            State Network
            <NotAllowedIcon />
          </Tab>
          <Tab isDisabled>
            Transaction Gossip Network
            <NotAllowedIcon />
          </Tab>
          <Tab isDisabled>
            Header Gossip Network
            <NotAllowedIcon />
          </Tab>
          <Tab isDisabled>
            Canonical Indices Network
            <NotAllowedIcon />
          </Tab>
        </TabList>
        {/* <VStack paddingTop={2} spacing={1} align="stretch">
          <Divider />
          <Divider />
          <Bootnodes
            portal={props.portal}
            LDB={props.LDB}
            setPeerEnr={props.setPeerEnr}
            handleClick={props.handleClick}
          />
        </VStack> */}
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
