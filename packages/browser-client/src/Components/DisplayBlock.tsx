import { CheckCircleIcon, CopyIcon } from '@chakra-ui/icons'
import {
  Box,
  Center,
  Grid,
  GridItem,
  Heading,
  HStack,
  Link,
  Skeleton,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  VStack,
} from '@chakra-ui/react'
import {
  fromHexString,
  HistoryNetworkContentKeyUnionType,
  toHexString,
  TxReceiptWithType,
} from 'portalnetwork'
import React, { useContext, useEffect, useState } from 'react'
import { AppContext, AppContextType, StateChange } from '../globalReducer'
import GetHeaderProofByHash from './GetHeaderProofByHash'
import SelectTx from './SelectTx'

const DisplayBlock = () => {
  const { state, dispatch } = useContext(AppContext as React.Context<AppContextType>)
  const [validated, setValidated] = useState(false)
  const [_receipts, setReceipts] = useState<TxReceiptWithType[]>([])

  useEffect(() => {
    state.provider!.portal.on('Verified', (key, verified) => {
      setValidated(verified)
    })
  }, [])

  const findParent = async () => {
    dispatch({ type: StateChange.TOGGLELOADING })
    const block = await state.provider!.getBlockWithTransactions(state.block!.parentHash)
    if (block) {
      dispatch({ type: StateChange.SETBLOCK, payload: block })
    }
    dispatch({ type: StateChange.TOGGLELOADING })
  }
  function GridRow(props: any) {
    return (
      <>
        <GridItem fontSize={'xs'} fontWeight="bold" colSpan={3}>
          {props.k[0]}
        </GridItem>
        <GridItem paddingBottom={3} fontSize={'xs'} wordBreak={'break-all'} colSpan={6}>
          {props.k[0] === 'parentHash' ? (
            <Link color={'blue'} onClick={async () => await findParent()}>
              {props.k[1]}
            </Link>
          ) : (
            <>{props.k[1]}</>
          )}
        </GridItem>
        <GridItem colSpan={1}> </GridItem>
      </>
    )
  }
  const block = state.block!
  const header = Object.entries(block)
    .map((entry) => {
      let val
      switch (typeof entry[1]) {
        case 'string':
          val = entry[1]
          break
        case 'object':
          val = entry[1].toString()
          break
        case 'number':
          val = entry[1].toString()
          break
      }
      return [entry[0], val]
    })
    .filter((entry) => entry[0].slice(0, 1) !== '_')

  async function init() {
    try {
      const receipts = await state.provider!.historyProtocol?.receiptManager.getReceipts(
        Buffer.from(block.hash.slice(2), 'hex')
      )
      if (receipts) {
        setReceipts(receipts)
      }
    } catch (err) {
      console.log((err as any).message)
    }
  }

  useEffect(() => {
    if (state.block!.transactions.length > 0) {
      init()
    }
  }, [state.block])

  const headerlookupKey = toHexString(
    HistoryNetworkContentKeyUnionType.serialize({
      selector: 0,
      value: {
        chainId: 1,
        blockHash: fromHexString(block.hash),
      },
    })
  )

  const bodylookupKey = toHexString(
    HistoryNetworkContentKeyUnionType.serialize({
      selector: 1,
      value: {
        chainId: 1,
        blockHash: fromHexString(block.hash),
      },
    })
  )

  return (
    <Box>
      <Heading paddingBottom={4} size="sm" textAlign={'center'}>
        <HStack justifyContent={'center'}>
          <span>Block #</span>
          <Skeleton isLoaded={!state.isLoading}>{block.number}</Skeleton>
          {validated && <CheckCircleIcon />}
        </HStack>
      </Heading>
      <Grid templateColumns={'repeat(16, 1fr'} columnGap={1}>
        <GridItem colSpan={4}>
          <Text fontSize="xs" textAlign={'start'}>
            <span style={{ fontWeight: 'bold' }}>Header Key: </span>
          </Text>
        </GridItem>
        <GridItem colStart={5} colSpan={1}>
          <CopyIcon
            marginEnd={2}
            cursor="pointer"
            onClick={() => navigator.clipboard.writeText(headerlookupKey)}
          />
        </GridItem>
        <GridItem wordBreak={'break-all'} colSpan={10} colStart={6}>
          <Skeleton isLoaded={!state.isLoading}>
            <Text wordBreak={'break-all'} fontSize="xs" textAlign={'start'}>
              {headerlookupKey}
            </Text>
          </Skeleton>
        </GridItem>
        <GridItem colSpan={4}>
          <Text fontSize="xs" textAlign={'start'}>
            <span style={{ fontWeight: 'bold' }}>Body Key: </span>
          </Text>
        </GridItem>
        <GridItem colStart={5} colSpan={1}>
          <CopyIcon
            marginEnd={2}
            cursor="pointer"
            onClick={() => navigator.clipboard.writeText(bodylookupKey)}
          />
        </GridItem>
        <GridItem wordBreak={'break-all'} colSpan={10} colStart={6}>
          <Skeleton isLoaded={!state.isLoading}>
            <Text wordBreak={'break-all'} fontSize="xs" textAlign={'start'}>
              {bodylookupKey}
            </Text>
          </Skeleton>
        </GridItem>
      </Grid>
      <Tabs>
        <Center>
          <TabList>
            <Tab>Header</Tab>
            <Tab>Transactions</Tab>
            <Tab>JSON</Tab>
          </TabList>
        </Center>
        <TabPanels>
          <TabPanel>
            <VStack>
              {validated || <GetHeaderProofByHash />}
              <Grid templateColumns={'repeat(10, 1fr)'}>
                {header &&
                  header.map((key, idx) => {
                    return <GridRow key={idx} k={key} idx={idx} />
                  })}
              </Grid>
            </VStack>
          </TabPanel>
          <TabPanel>{state.block!.transactions.length > 0 && <SelectTx />}</TabPanel>
          <TabPanel>
            <Skeleton isLoaded={!state.isLoading}>
              <Text wordBreak={'break-all'}>{JSON.stringify(block)}</Text>
            </Skeleton>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  )
}

export default DisplayBlock
