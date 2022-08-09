import {
  BUFFER_SIZE,
  encodeWithVariantPrefix,
  Packet,
  PacketType,
} from '../../src/wire/utp/index.js'
import { fromHexString } from '@chainsafe/ssz'

const DEFAULT_RAND_SEQNR = 5555
const DEFAULT_RAND_ACKNR = 4444
let block = fromHexString(
  '0xf90434f90215a00c1cf9b3d4aa3e20e12b355416a4e3202da53f54eaaafc882a7644e3e68127eca0f4174c5237efe5dfcb1f91cee73ef3e15f896775f5374f8628f6660cd0b991dc94790b8a3ce86e707ed0ed32bf89b3269692a23cc1a03b98c5006b88099ed6ca063af4d9bea89698d5d801a58a35b2aed98165ee5fb8a056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421a056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421b90100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008605af25d1fc5083030d43832fefd8808455ee02ad98d783010102844765746887676f312e342e32856c696e7578a0497b768e3d6e1e71063731cbd6efeb0ba6f4f8a1325f8bc89994168b873ddc27887b14e3ad9b3bd930c0f90218f90215a013ced9eaa49a522d4e7dcf80a739a57dbf08f4ce5efc4edbac86a66d8010f693a01dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347941dcb8d1f0fcc8cbc8c2d76528e877f915e299fbea0afe287aafc9e00aa3f0179c2eb41b9bae0aabe571fc9b1b46bb3da1036b25e01a0cf08f8f9c3416d71d76e914799ba9ac59bd2b36d64e412fee101ad438281b170a0acf0270ca48a90509ee1c00b8bd893a2653b6b7a099433104305fba81ea903cfb90100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008605af25e8b8e583030d41832fefd882a4108455ee029796d583010102844765746885676f312e35856c696e7578a0ed167976e19753250f87c908873675e548a0c204a13b35c7ef9214582261e9f488d74671daa008f803'
)
const blockChunks: Uint8Array[] = []
const dataChunks: Uint8Array[] = []
let accumulator = fromHexString(
  '0x080000000800000088e96d4537bea4d9c05d12549907b32561d3bf31f45aae734cdc119f13406cb6000080ff03000000000000000000000000000000000000000000000000000000b495a1d7e6663152ae92708da4843337b958146015a2802f4193a410044698c9001080fe070000000000000000000000000000000000000000000000000000003d6122660cc824376f11ee842f83addc3525e2dd6756b9bcf0affa6aa88cf741fe3f00fd0b00000000000000000000000000000000000000000000000000000023adf5a3be0f5235b36941bcb29b62504278ec5b9cdfa277b992ba4a7a3cd3a2f79f00fb0f000000000000000000000000000000000000000000000000000000f37c632d361e0a93f08ba29b1a2c708d9caa3ee19d1ee8d2a02612bffe49f0a9fbbf80f9130000000000000000000000000000000000000000000000000000001f1aed8e3694a067496c248e61879cda99b0709a1dfbacd0b693750df06b326efb0f81f717000000000000000000000000000000000000000000000000000000e0c7c0b46e116b874354dce6f64b8581bd239186b03f30a978e3dc38656f723a052001f61b0000000000000000000000000000000000000000000000000000002ce94342df186bab4165c268c43ab982d360c9474f429fec5565adfc5d1f258b110001f51f000000000000000000000000000000000000000000000000000000997e47bf4cac509c627753c06385ac866641ec6f883734ff7944411000dc576e19c080f4230000000000000000000000000000000000000000000000000000004ff4a38b278ab49f7739d3a4ed4e12714386a9fdf72192f2e8f7da7822f10b4d299080f3270000000000000000000000000000000000000000000000000000003f5e756c3efcb93099361b7ddd0dabfeaa592439437c1c836e443ccb81e93242334000f32b000000000000000000000000000000000000000000000000000000c63f666315fa1eae17e354fab532aeeecf549be93e358737d0648f50d57083a033e0fff22f00000000000000000000000000000000000000000000000000000055b6a7e73c57d1ca35b35cad22869eaa33e10fa2a822fb7308f419269794d6113f807ff23300000000000000000000000000000000000000000000000000000046015afbe00cf61ff284c26cc09a776a7303e422c7b359fe4317b4e6aaa410a43f107ff2370000000000000000000000000000000000000000000000000000002d33dc73755afbbbeb6ec4885f2923398901bf1ad94beb325a4c4ecad5bf0f1c31a0fef23b0000000000000000000000000000000000000000000000000000009657beaf8542273d7448f6d277bb61aef0f700a91b238ac8b34c020f7fb8664c1440fef33f000000000000000000000000000000000000000000000000000000f25fe829ebbf3e2459ecb89cbc1aaa5f83c04501df08d63fa8dd1589f6b1cae0eaff7df543000000000000000000000000000000000000000000000000000000480ff3f8a495b764e4361a6c2e296f34e8721cf1ec54fe5c46827937353bf118b7ef7df747000000000000000000000000000000000000000000000000000000ec888de9fa46cb7a47b7bd812a2f601d948d89e5317cf9f68976a0dec92b1ee2811ffef94b000000000000000000000000000000000000000000000000000000720c47720a39b4b2f04ca82420b8272910a7c397710fcb8ed8337f5a007e39ec509ffefc4f000000000000000000000000000000000000000000000000000000b8de276e2666e121a926f1b2654f2208165e52c609e56730081bf6aec313a8a22e7f7f0054000000000000000000000000000000000000000000000000000000a8f91e9df6bfd1424a9ec9b0149f01aa31cceed3b21bac7376d90d7f0cd80cf427cf800458000000000000000000000000000000000000000000000000000000639f5f5e5b7e354de98dbc0857be83603d57ff55029f6488c96da0c5e42ed91a499f02095c000000000000000000000000000000000000000000000000000000addd21b8792c377d83a812dd1bdd539b8e277453bc28182d7526306c5cb48bc0a5ff040e60000000000000000000000000000000000000000000000000000000bdf3b4b0005c4704878d3048386f1b96685401c1711833b6baad021f4f9e0aa24d00881364000000000000000000000000000000000000000000000000000000c487344078edd37468146521efee5480ea87663435a2510ec0ca9dc11259e8a755b18b1968000000000000000000000000000000000000000000000000000000955aa394d09a093d9cb3580e3ad179ce195333f858e45e6a007b2a0b2e165b4ed32210206c000000000000000000000000000000000000000000000000000000a3242d17c10836abe0c20c8a7726d21c1d76d7fb874afb46e3360119d5bf756adf64152770000000000000000000000000000000000000000000000000000000e91bc2264d69287157d23d450e34f39925cebe653f3bf02d4a81a8308d02ad9d93879b2e74000000000000000000000000000000000000000000000000000000d1eb5ef56d30f0d773cccd3075c7fcca14ec9013db6b76344c69dbbaffaa9b8c0b9ba2367800000000000000000000000000000000000000000000000000000064ebbd8a7d103b1a706aa43de55aaa16072314db26b121957a0d9885000a59d565af2a3f7c00000000000000000000000000000000000000000000000000000088be699fe3ea3991e20a614873f2d653f8989ead9f6d6a40ab2e27b51260ae13c1d43348800000000000000000000000000000000000000000000000000000000cd0deee59ab5b671659a11eec037a6b5c00fb6243c89aa469559b74db35e310411bbe5184000000000000000000000000000000000000000000000000000000a69d34a812a45e5d4829850e8a48747c5e42e9e942e4533bcfedbc4b746e213f0993c95b88000000000000000000000000000000000000000000000000000000395005a57cc7b5c28269c3ee81c20d33654cb1a2fbb0ffeab023cc7e5d96a4743f4c56668c0000000000000000000000000000000000000000000000000000005f81bfa69fc8acbf14e8c301f3269dac88298f52abbf80edd151703aff8cbf9a0c576471900000000000000000000000000000000000000000000000000000000ee49bf845e5d29a274bbab5b4ea7619a70b71e329b3c903236c3251d3f13e329ac3f37c94000000000000000000000000000000000000000000000000000000f69e349faa9b6f19d341c9df22bb89caea5bb71a88c90d91871da413b624ded015a20489980000000000000000000000000000000000000000000000000000006417bd3e58fbb42842be357b1b44a91a44b4907be271bb87990fd6015c99c0f7ab0297959c000000000000000000000000000000000000000000000000000000c1579a13cfd2bd9050a5615968e1e9ccc3ba751b3343756851ece8d4a852d0848df5aaa2a0000000000000000000000000000000000000000000000000000000663b90888ed45a40fe29d275715ec74755f1aff628e6715bab56345e6573600fed8a40b0a400000000000000000000000000000000000000000000000000000074d74553948545d4754462d28d3fa4f8efb6f35e08559616df1c5c72695ae0b6ffd257bea80000000000000000000000000000000000000000000000000000003f46ac63f1fd838fa08b3d161912609f01ef85ff707747609f92e1df5a4ae364faddf0ccac0000000000000000000000000000000000000000000000000000004802b47c54c87377d002c82b481e89d8ab83263ffafbbd68a99ad6f36da39a6c16bc0bdcb00000000000000000000000000000000000000000000000000000009827f73abdb989e38f71d22533fb9c9419f3041de02d57ae97915198b3a6a7da8d7da8ebb40000000000000000000000000000000000000000000000000000001ec36e7b5fda6273f96eb70f2fe4e7bb5960c29276a2e63cc14491d37eb7d45d9c32c7fbb8000000000000000000000000000000000000000000000000000000b2f6c6b71c743d84dca2976e877fb1e3c5082d537d0f0ea437a177bff19e406e81eb670cbd0000000000000000000000000000000000000000000000000000007ea0d8ac55bcc49999192ae6223823a955e24e9eade7445fd7338169a161cfd87db88a1dc100000000000000000000000000000000000000000000000000000036152f77dab83242172be7de0ca3aac20f647236732b3497008993acb927a57ad2a92f2fc5000000000000000000000000000000000000000000000000000000f2940e16e514f3580a5be5ddcd3bc4ab454e5a0708076ea08b2ff377efd07966c5cf5641c90000000000000000000000000000000000000000000000000000005a56f6bb265cc86120b65859219b9ee767f620aecd5c0e0dfd87e04ed072541f9c3a0054cd000000000000000000000000000000000000000000000000000000b46c23963c81c0ade54650a77ccb71ff66a89e93dfca6682ecfb6a4a43f77feba0fa2b67d1000000000000000000000000000000000000000000000000000000bfa70f2abf0dbfb19002e71520dfd50f97beca37536c628fd2b3a9eb4cec980f1c20da7ad50000000000000000000000000000000000000000000000000000008387c762fbc3d4144c4bcb3a5a1ceedadc33d8890bcc233cbb14547851c0d90e5cbb0a8fd9000000000000000000000000000000000000000000000000000000eb5889a21ebe13e2294e5b29c2bfc4a7a0af3d64cbd97a013669584fcec935f9afdcbda3dd00000000000000000000000000000000000000000000000000000060b813933719e5597bddace3821f89be8f4389d44199eb8fdae9e1e2670bf51e6694f3b8e1000000000000000000000000000000000000000000000000000000f394e8a094b2c701e66c8074ee7da247b676f71ba1633a68435f5e2aee975c5cd3f2abcee5000000000000000000000000000000000000000000000000000000cd5b5c4cecd7f18a13fe974255badffd58e737dc67596d56bc01f063dd282e9e4b08e7e4e90000000000000000000000000000000000000000000000000000004d9423080290a650eaf6db19c87c76dff83d1b4ab64aefe6e5c5aa2d1f4b662325e5a4fbed0000000000000000000000000000000000000000000000000000003cd0324c7ba14ba7cf6e4b664dea0360681458d76bd25dfc0d2207ce4e9abed4ba99e512f20000000000000000000000000000000000000000000000000000004fba74448284fcd96d80f7014a312ca47b8e1ba94757fe88c1461609dfbe79f36536a92af600000000000000000000000000000000000000000000000000000059b0d0c873c975a686df424b9a7b6c33acf5d1ffa398060f1ee954b79a13330783cbef42fa000000000000000000000000000000000000000000000000000000c276868064fe701b091176b2246ceb87747db07ca1e8f58d997a26da6ff8b2ba7369b95bfe0000000000000000000000000000000000000000000000000000002829000cd655685de08e75215136ebd485911d22e0dca0fada8347b36ad22642962006750201000000000000000000000000000000000000000000000000000035209c6cd94dc0e470225715ade78d4ec82470d21b2738f4f66bd66e88d130dd4f01d68e060100000000000000000000000000000000000000000000000000005fa77eb917376d67d72a7fae42b286a6a11e6e7e11d1f73dfae009b1bfc6cb76041c29a90a010000000000000000000000000000000000000000000000000000a88f79e9ae36590a96298bc020e113571b53391eb0888348c8a9c849569468c41c81ffc30e0100000000000000000000000000000000000000000000000000001e6b577245d478eb57e298e34a34d6fb981872f8160c57864b8168807b9ed0ba004159df120100000000000000000000000000000000000000000000000000005dbe4cd314ac4f94113e31b26b32ca18285af7ee1b89cb7548dcc7554762aa6c1b6c36fb1601000000000000000000000000000000000000000000000000000054cde7138e5c357fa23f697614729e153688820232531371443ff9ed50aef133db1297171b010000000000000000000000000000000000000000000000000000c7553e669b7cf2fdc8c1608764d18eca3d672966280cfcfe33d5debf46aad92baf457b341f0100000000000000000000000000000000000000000000000000003d4051de1b8650b98ffdbe4144b68e32a903b98ea5cb16cd843cbda9098af2010915e35123010000000000000000000000000000000000000000000000000000e52e8cddf69b9a7f9490510d308252d498471a2a918387076340ca3cdc586c165c91ce6f270100000000000000000000000000000000000000000000000000005836b8df56257a8eb0043ac5c34e2fb5f73944da8d8ad8994b976237f962f2261ecb3d8e2b0100000000000000000000000000000000000000000000000000006bf1734165b2cec0a424b25dca633871ec5850335ab6983cba17969823b5f799c7d230ad2f0100000000000000000000000000000000000000000000000000009886ba26bdb9f7fb2f803c5d60d544cdaf7b035e77c2405d8c48797d00b153bad0b8a7cc330100000000000000000000000000000000000000000000000000001afc0da74db403f37a3b6e2102731530381b6cac9654a3a0d04b9712143626ceb58da2ec3701000000000000000000000000000000000000000000000000000097564b226f1742d9d073994d3d664208d95e859a9a4dac2c62ac903a5268587ef461210d3c0100000000000000000000000000000000000000000000000000006709246317a040528f75b7b346a49e117f65d0755b74921e194a3f5371c4a19f0d46242e4001000000000000000000000000000000000000000000000000000016b4c82e2152c9812025b99424651367b3eec85768a693d66050cc7ff1ebae61824aab4f44010000000000000000000000000000000000000000000000000000cb56dc3a0b74cc674fa1ebc1bf12d0772b8de71aac77156c600342140433418dd77fb671480100000000000000000000000000000000000000000000000000008614615efab2d25eff18b1a339dd55c6aba83debffdaa07fae0901564e3f3d8c92f645944c010000000000000000000000000000000000000000000000000000a3ee1b6def05ceab6c35880a665164880d60637de471eda6a5aedf741b46eba33bbf59b750010000000000000000000000000000000000000000000000000000e344c556c9e888256e43a67c3ba3b73f444e61e720b1ca0631674c1f899606475deaf1da540100000000000000000000000000000000000000000000000000007c9ccd0c0b7d9008836c181c24564a3fbfa6281a7e2a92f5b5d6e040a33be7ca84880eff580100000000000000000000000000000000000000000000000000005dfecd1f7883c8ec60ddecd4301f217290197de78002b4204d54d8b2a022f8263eaaaf235d010000000000000000000000000000000000000000000000000000a608cee22cf6d8d83ce76592d9eaffb73e566c6382ae21654448da0f7ad1768b1c60d54861010000000000000000000000000000000000000000000000000000ba39b4ee19e5db0f5a85c344aa2bd2e7b0cdb2404b7d5c0e6cdc08c83f85083eb0ba7f6e650100000000000000000000000000000000000000000000000000006da5970538eba5db93162e219182fca7e093cfe4fbd8dd0b82789adb25dcbb428fcaae9469010000000000000000000000000000000000000000000000000000'
)
for (let i = 0; i < accumulator.length / BUFFER_SIZE; i++) {
  const start = 0
  const end = accumulator.length > 512 ? 512 : undefined
  dataChunks[i] = accumulator.subarray(start, end)
  accumulator = accumulator.subarray(end)
}
for (let i = 0; i < block.length / BUFFER_SIZE; i++) {
  const start = 0
  const end = block.length > 512 ? 512 : undefined
  blockChunks[i] = block.subarray(start, end)
  block = block.subarray(end)
}

const _blocks = [
  '0xf9028df90217a013ced9eaa49a522d4e7dcf80a739a57dbf08f4ce5efc4edbac86a66d8010f693a01dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d493479452bc44d5378309ee2abf1539bf71de1b7d7be3b5a0ac4ba3fe45d38b28e2af093024e112851a0f3c72bf1d02b306506e93cd39e26da068d722d467154a4570a7d759cd6b08792c4a1cb994261196b99735222b513bd9a00db8f50b32f1ec33d2546b4aa485defeae3a4e88d5f90fdcccadd6dff516e4b9b90100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008605af25e8b8e583030d41832fefd88252088455ee029798d783010102844765746887676f312e342e32856c696e7578a0ee8523229bf562950f30ad5a85be3fabc3f19926ee479826d54d4f5f2728c245880a0fb916fd59aad0f870f86e822d85850ba43b740083015f90947c5080988c6d91d090c23d54740f856c69450b29874b04c0f2616400801ba09aaf0e60d53dfb7c34ed51991bd350b8e021185ccc070b4264e209d16df5dc08a03565399bd97800b6d0e9959cd0920702039642b85b37a799391181e0610d6ba9c0',
  '0xf9028ef90217a08faf8b77fedb23eb4d591433ac3643be1764209efa52ac6386e10d1a127e4220a01dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d493479452bc44d5378309ee2abf1539bf71de1b7d7be3b5a0bd0eaff61d52c20e085cb7a7c60b312c792e0b141c5a00e50fd42f8ae1cfe51da09b763cefd23adf252ba87898f7cb8ccc06a4ebddc6be9032648fd55789d4c0b8a0cbb141d48d01bbbf96fb19adff38fb2a6c5e3de40843472a91067ef4f9eac09fb90100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008605afdbcd75fd83030d42832fefd88252088455ee029f98d783010102844765746887676f312e342e32856c696e7578a04ddfa646f9a9ec8507af565631322186e2e06347586c9f137383d745ee8bf5958885808f6bbbb2a835f871f86f822d86850ba43b740083015f9094c197252baf4a4d2974eab91039594f789a8c207c88017a798d89731c00801ca0825c34f6ddfad0c9fe0e2aa75a3bff9bccc21e81a782fb2a454afb4ad4abac70a0106d3942a42839f74bbbf71b6ff8c5b11082af8b0ff2799cb9b8d14b7fcc9e11c0',
  '0xf90434f90215a00c1cf9b3d4aa3e20e12b355416a4e3202da53f54eaaafc882a7644e3e68127eca0f4174c5237efe5dfcb1f91cee73ef3e15f896775f5374f8628f6660cd0b991dc94790b8a3ce86e707ed0ed32bf89b3269692a23cc1a03b98c5006b88099ed6ca063af4d9bea89698d5d801a58a35b2aed98165ee5fb8a056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421a056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421b90100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008605af25d1fc5083030d43832fefd8808455ee02ad98d783010102844765746887676f312e342e32856c696e7578a0497b768e3d6e1e71063731cbd6efeb0ba6f4f8a1325f8bc89994168b873ddc27887b14e3ad9b3bd930c0f90218f90215a013ced9eaa49a522d4e7dcf80a739a57dbf08f4ce5efc4edbac86a66d8010f693a01dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347941dcb8d1f0fcc8cbc8c2d76528e877f915e299fbea0afe287aafc9e00aa3f0179c2eb41b9bae0aabe571fc9b1b46bb3da1036b25e01a0cf08f8f9c3416d71d76e914799ba9ac59bd2b36d64e412fee101ad438281b170a0acf0270ca48a90509ee1c00b8bd893a2653b6b7a099433104305fba81ea903cfb90100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008605af25e8b8e583030d41832fefd882a4108455ee029796d583010102844765746885676f312e35856c696e7578a0ed167976e19753250f87c908873675e548a0c204a13b35c7ef9214582261e9f488d74671daa008f803',
  '0xf90202f901fda046b332ceda6777098fe7943929e76a5fcea772a866c0fb1d170ec65c46c7e3aea01dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d493479471f954533c351653b9e5d4c15220910627a0c976a0627c054b68081c30ea2ec64d4ea609445ba5ddc3050a6bef4e7ec0cba23ce209a056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421a056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421b90100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008605afdbb6b69083030d44832fefd8808455ee02b380a04a296112660546299c9f984e0e4432ad28a27ea117186a958d78473372dfb09a888a85aef81c3ac463c0c0',
  '0xf90202f901fda001f2fe06ea73ebc0e10c8b9b25b0a58c2d2319d78d78e93cd8f33283ec86e878a01dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d4934794623d2411c3bb3340784155f9a688b0085251ab5ca0738390c87f7b07a6d575dfdcf467a8412c516d1d2655c5c706ebe15565ac7d4ba056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421a056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421b90100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008605af25bb3fbb83030d45832fefd8808455ee02c480a077ae941cdeb99acceb9599e248d7eef036893dc62d5fef13800919b42c325fb588b6146e759001f4eac0c0',
  '0xf9028af90215a08441bdd3500b0bf059ad5e41a9aa7bace7b97d34ab2ece6709d65f4b23b5cd53a01dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d4934794e6a7a1d47ff21b6321162aea7c6cb457d5476bcaa066292dea814388296afdd64d39f0c33217f51b51e49eeb7cfc452d85cd8a5469a0036e3e495e2f15cf4b57c78c347eafb830b6a08af1e9441bc533f25520a10aeea00724d6de990c3b55c6a4d7088fc0df0f3cea12247eaa8a71e605c5a3a37a9d0bb90100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008605ae6fd6885583030d46832fefd88252088455ee02d396d583010102844765746885676f312e35856c696e7578a084089e31357603395aaff3405d74e77b57f35feb44854d6de4bf814240637b6f8815e4aaac7aaf6675f86ff86d80850ba43b74008252089429a5c4dd6ea36dece410084343b1310d40f7917b89015af1d78b58c40000801ba035353f7340badf64668d619da22dc09767b42701a42919baf0f6e67917469c42a005472236d2b1c471ed6e7f7ae4cfdaf9f101ee50413f7017ac9e5b674f4bee75c0',
  '0xf902f9f90217a0087128daf290420341af422551fbf0ace62a06b9193ab1706126fef975319ebfa01dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d493479452bc44d5378309ee2abf1539bf71de1b7d7be3b5a0c753e4ec3841d1765975908004edaee97126df1c27a8dbac4ca4362787a0a6b4a002159ee1bb595d71ad67744cfc6ac10aa6becd8fbf2ffe9052a8732e8747a93fa031541775bfffc833ad9dfc058482d41642d01aa356b2685388e1c3bf0de7c33bb90100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008605adba088d8583030d47832fefd882a4108455ee02ed98d783010102844765746887676f312e342e32856c696e7578a0c8f5d988a98d67e49bd3d70c5ddb2c35d7c33f3e18695c7199661fce327dc6628861be0c37c658fd23f8dcf86c4f850ba43b74008252089432be343b94f860124dc4fee278fdcbd38c102d88880df0142ce7946800801ca0651ae29521bc50b336a7c3dc4509cd65465b79208c7fe33ecdc1d0523d199bb2a05499e634ce3a25c88e083475bc035f76699f9473680a5839b96373d7bfd1ff27f86c1e850ba43b74008252089432be343b94f860124dc4fee278fdcbd38c102d8888458debe9dcf23c00801ba0da46f8484ef1cf65edd8364c88d90034fd37d30357886d10890a6e1b172bfd19a005712910f49e9e955d498034e1c1a7cd1236539c8e0dc1b6068a9b4b0d60aaa2c0',
  '0xf9028bf90215a03203188e07e71da78eaf9e6b6d2c9535e2541c60214bc797fe21566f4b7fbd61a01dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347941dcb8d1f0fcc8cbc8c2d76528e877f915e299fbea0046e3460752018623fab5281291b36a2d69066d449d918b0c6f30f3136e5966ba08cb2fe8f10debba9d6bc251d1968d65d7a197b5e53b94e273dd4be311da02790a044c82107c9a702f945c11edbc0c2093b08d5456b3870797658f24a3bb6cd44c6b90100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008605ad04514c7583030d48832fefd88252088455ee030496d583010102844765746885676f312e35856c696e7578a04db53587b42fff30656cca71926aca5d332bfa6785d712f463891d82946503f98847bdfcf722f94228f870f86e820a56850ba43b74008252089403e2084aeca980ba3480a69e6bb572d0825be644885c41d6ac2fc94000801ca019c2bae26079dcaaa7889c251424a439343855ee837b2080507eb0a1c5877215a00c31920830894e547f2a73fe469aa9b2fb0e85123e659fb5a1deee55295f168dc0',
  '0xf902fcf90215a07aaadeb8cf3e1dfda9f60fd41ea6204efa4cabcba89e61881ad475d50e63dfd0a01dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347948d8dfbd04db0942d79bb1bb038e8876bb67ff825a0452cc68add3c15c934408e239668c8242aa9a6a4a6ddad1e26a263e260985edfa0db6d3f3f2df5d8ab87d8606f311f87fb7cdfac55c6b7dc7cdbbbf99521e740f9a097f473dd762240d1dfe1805cdc5bec150682b7e436c89b1ff3cde2e1d1f7dbe6b90100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008605ac4eb0c24d83030d49832fefd882a4108455ee031496d583010102844765746885676f312e35856c696e7578a0b9339fdca233a20be476758e3a8e9268dd85640546e8bb7a0e13238c8ecd6648880dc8e5ea080aa316f8e1f86e822d87850ba43b740083015f9094773d1c659c2ad1875502132cf4eba6f9ed88e0c787203f97b12f0002801ca0a958fe87e26462f5eeafa48acc5b8493658351f6eb6b4cc3a68b72e03d33af62a0221987fe034ec7d455f1d45446d954ddb3ea0d71eab6d8e47e7726271fbbb539f86f822d88850ba43b740083015f909444c1440ed5e2c9db37ae4da02b60f8a430b805d0888b46e44ae73d6000801ba038d5b0fc1369d9cb7e8412a87b229a0ec530d015ad7d747f4752982e5597effba0629ca6e10b90f6984d1fcb4f94c172812c8e1fb355513fc76c0181fc18adff16c0',
  '0xf90218f90213a06380444f2ed861889c7164c889620130d378f75dd9412d033462d86d7ad9bad4a01dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347941dcb8d1f0fcc8cbc8c2d76528e877f915e299fbea0853b9bad1f716488446ee21ec83969c5298e84ddfef1afdf1d5293481db3bdcba056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421a056e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421b90100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008605ab9926ec3683030d4a832fefd8808455ee035196d583010102844765746885676f312e35856c696e7578a04eba0b42fb6f6caf0a7dd8141c21b093224f6b672a8cab3778eb03ce4898fbd18883cc96074530bebfc0c0',
]
const blocks = _blocks.map((hex) => {
  return fromHexString(hex)
})
let compressed = encodeWithVariantPrefix(blocks)

const offerChunks: Uint8Array[] = []

for (let i = 0; i < compressed.length / BUFFER_SIZE; i++) {
  const start = 0
  const end = compressed.length > 512 ? 512 : undefined
  offerChunks[i] = compressed.subarray(start, end)
  compressed = compressed.subarray(end)
}

export function Packets(
  type: string,
  rcvId: number,
  sndId: number
): {
  send: Record<string, Packet | Packet[]>
  rec: Record<string, Packet | Packet[]>
} {
  if (type === 'FINDCONTENT_READ') {
    const dataPackets = dataChunks.map((chunk, i) => {
      const p = Packet.create(PacketType.ST_DATA, {
        sndConnectionId: rcvId,
        seqNr: DEFAULT_RAND_SEQNR + 1 + i,
        ackNr: 2 + i,
        payload: chunk,
      })
      return p
    })
    const dataAcks = dataPackets.map((p, i) => {
      return Packet.create(PacketType.ST_STATE, {
        sndConnectionId: sndId,
        seqNr: 3 + i,
        ackNr: p.header.seqNr,
      })
    })

    const testPackets = {
      send: {
        syn: Packet.create(PacketType.ST_SYN, {
          sndConnectionId: sndId,
          seqNr: 1,
          ackNr: DEFAULT_RAND_ACKNR,
        }),
        synackack: Packet.create(PacketType.ST_STATE, {
          sndConnectionId: sndId,
          seqNr: 2,
          ackNr: DEFAULT_RAND_SEQNR,
        }),
        dataAcks: dataAcks,
        finack: Packet.create(PacketType.ST_STATE, {
          sndConnectionId: sndId,
          seqNr: 2 + dataAcks.length,
          ackNr: DEFAULT_RAND_SEQNR + 1 + dataPackets.length,
        }),
      },
      rec: {
        synack: Packet.create(PacketType.ST_STATE, {
          sndConnectionId: rcvId,
          seqNr: DEFAULT_RAND_SEQNR,
          ackNr: 1,
        }),
        data: dataPackets,
        fin: Packet.create(PacketType.ST_FIN, {
          sndConnectionId: rcvId,
          seqNr: DEFAULT_RAND_SEQNR + 1 + dataPackets.length,
          ackNr: 2 + dataPackets.length,
        }),
      },
    }
    return testPackets
  } else if (type === 'FOUNDCONTENT_WRITE') {
    const dataPackets = dataChunks.map((chunk, i) => {
      const p = Packet.create(PacketType.ST_DATA, {
        sndConnectionId: sndId,
        seqNr: DEFAULT_RAND_SEQNR + 1 + i,
        ackNr: 2 + i,
        payload: chunk,
      })
      return p
    })
    const dataAcks = dataPackets.map((p, i) => {
      return Packet.create(PacketType.ST_STATE, {
        sndConnectionId: rcvId,
        seqNr: 3 + i,
        ackNr: p.header.seqNr,
      })
    })
    const testPackets = {
      send: {
        synack: Packet.create(PacketType.ST_STATE, {
          sndConnectionId: sndId,
          seqNr: DEFAULT_RAND_SEQNR,
          ackNr: 1,
        }),
        data: dataPackets,
        fin: Packet.create(PacketType.ST_FIN, {
          sndConnectionId: sndId,
          seqNr: DEFAULT_RAND_SEQNR + 1 + dataPackets.length,
          ackNr: 2 + dataPackets.length,
        }),
      },
      rec: {
        syn: Packet.create(PacketType.ST_SYN, {
          sndConnectionId: rcvId,
          seqNr: 1,
          ackNr: DEFAULT_RAND_ACKNR,
        }),
        synackack: Packet.create(PacketType.ST_STATE, {
          sndConnectionId: rcvId,
          seqNr: 2,
          ackNr: DEFAULT_RAND_SEQNR,
        }),
        acks: dataAcks,
        finack: Packet.create(PacketType.ST_STATE, {
          sndConnectionId: rcvId,
          seqNr: 3 + dataAcks.length,
          ackNr: DEFAULT_RAND_SEQNR + 1 + dataPackets.length,
        }),
      },
    }
    return testPackets
  } else if (type === 'OFFER_WRITE') {
    const dataPackets = offerChunks.map((chunk, i) => {
      return Packet.create(PacketType.ST_DATA, {
        sndConnectionId: sndId,
        seqNr: 2 + i,
        ackNr: DEFAULT_RAND_ACKNR + 1 + i,
      })
    })
    const dataAcks = dataPackets.map((p, i) => {
      return Packet.create(PacketType.ST_STATE, {
        sndConnectionId: rcvId,
        seqNr: DEFAULT_RAND_ACKNR + 2 + i,
        ackNr: 2 + i,
      })
    })
    const testPackets = {
      send: {
        syn: Packet.create(PacketType.ST_SYN, {
          sndConnectionId: sndId,
          seqNr: 1,
          ackNr: DEFAULT_RAND_ACKNR,
        }),
        data: dataPackets,
        fin: Packet.create(PacketType.ST_FIN, {
          sndConnectionId: sndId,
          seqNr: 2 + dataPackets.length,
          ackNr: DEFAULT_RAND_ACKNR + 1 + dataPackets.length,
        }),
      },
      rec: {
        synack: Packet.create(PacketType.ST_STATE, {
          sndConnectionId: rcvId,
          seqNr: DEFAULT_RAND_SEQNR,
          ackNr: 1,
        }),
        acks: dataAcks,
        finack: Packet.create(PacketType.ST_FIN, {
          sndConnectionId: rcvId,
          seqNr: DEFAULT_RAND_ACKNR + 2 + dataAcks.length,
          ackNr: 2 + dataPackets.length,
        }),
      },
    }
    return testPackets
  } else if (type === 'ACCEPT_READ') {
    const dataPackets = offerChunks.map((chunk, i) => {
      return Packet.create(PacketType.ST_DATA, {
        sndConnectionId: rcvId,
        seqNr: 2 + i,
        ackNr: DEFAULT_RAND_ACKNR + 1 + i,
        payload: chunk,
      })
    })
    const dataAcks = dataPackets.map((p, i) => {
      return Packet.create(PacketType.ST_STATE, {
        sndConnectionId: sndId,
        seqNr: DEFAULT_RAND_ACKNR + 2 + i,
        ackNr: 2 + i,
      })
    })
    const testPackets = {
      send: {
        synack: Packet.create(PacketType.ST_STATE, {
          sndConnectionId: sndId,
          seqNr: DEFAULT_RAND_SEQNR,
          ackNr: 1,
        }),
        acks: dataAcks,
        finack: Packet.create(PacketType.ST_FIN, {
          sndConnectionId: sndId,
          seqNr: DEFAULT_RAND_ACKNR + 2 + dataAcks.length,
          ackNr: 2 + dataPackets.length,
        }),
      },
      rec: {
        syn: Packet.create(PacketType.ST_SYN, {
          sndConnectionId: sndId,
          seqNr: 1,
          ackNr: DEFAULT_RAND_ACKNR,
        }),
        data: dataPackets,
        fin: Packet.create(PacketType.ST_FIN, {
          sndConnectionId: sndId,
          seqNr: 2 + dataPackets.length,
          ackNr: DEFAULT_RAND_ACKNR + 1 + dataPackets.length,
        }),
      },
    }
    return testPackets
  } else if (type === 'FINDCONTENT_READ-Block') {
    const dataPackets = blockChunks.map((chunk, i) => {
      const p = Packet.create(PacketType.ST_DATA, {
        sndConnectionId: rcvId,
        seqNr: DEFAULT_RAND_SEQNR + 1 + i,
        ackNr: 2 + i,
        payload: chunk,
      })
      return p
    })
    const dataAcks = dataPackets.map((p, i) => {
      return Packet.create(PacketType.ST_STATE, {
        sndConnectionId: sndId,
        seqNr: 3 + i,
        ackNr: p.header.seqNr,
      })
    })

    const testPackets = {
      send: {
        syn: Packet.create(PacketType.ST_SYN, {
          sndConnectionId: sndId,
          seqNr: 1,
          ackNr: DEFAULT_RAND_ACKNR,
        }),
        synackack: Packet.create(PacketType.ST_STATE, {
          sndConnectionId: sndId,
          seqNr: 2,
          ackNr: DEFAULT_RAND_SEQNR,
        }),
        dataAcks: dataAcks,
        finack: Packet.create(PacketType.ST_STATE, {
          sndConnectionId: sndId,
          seqNr: 2 + dataAcks.length,
          ackNr: DEFAULT_RAND_SEQNR + 1 + dataPackets.length,
        }),
      },
      rec: {
        synack: Packet.create(PacketType.ST_STATE, {
          sndConnectionId: rcvId,
          seqNr: DEFAULT_RAND_SEQNR,
          ackNr: 1,
        }),
        data: dataPackets,
        fin: Packet.create(PacketType.ST_FIN, {
          sndConnectionId: rcvId,
          seqNr: DEFAULT_RAND_SEQNR + 1 + dataPackets.length,
          ackNr: 2 + dataPackets.length,
        }),
      },
    }
    return testPackets
  } else {
    throw new Error('nope')
  }
}
