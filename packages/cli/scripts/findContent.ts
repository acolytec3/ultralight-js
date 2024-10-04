import { hexToBytes } from '@ethereumjs/util'
import jayson from 'jayson/promise/index.js'

import type { HttpClient } from 'jayson/promise/index.js'

// Optimistic update for signature_slot 6718464
const contentKey = '0x0117aa411843cb100e57126e911f51f295f5ddb7e9a3bd25e708990534a828c4b7'
const content =
  '0x08000000fb1f00009800000006010000b3010000600200000e030000ba03000009090000d6090000c90a0000760b0000630c0000110e0000770e0000020f0000ef0f00009a10000045110000f01100009b12000046130000f11300009c14000047150000f21500009d16000048170000f31700009e18000049190000f41900009f1a00004a1b0000f51b0000a01c00004a1d0000f51d00009f1e0000491f0000f86c0385098bca5a0083017318949bd346e00898e4981cefe1acbb4745bf58dc804587127fbd295870008026a0753000ddcf836e4597cf9dd58a5d123747f02dddc4d555c16fdc11d8d8f8155fa03728fc72efd7f7d36efc3e9cdf61a191b342e64ac72faffe6ef523b3bd73fe60f8ab8256af85037e11d60082ea60948ad6739649f1fbf079882c14d27862d5c220666080b844a9059cbb000000000000000000000000703052a1ef835dd5842190e53896672b8f9249f100000000000000000000000000000000000000000000000068155a43676e000025a0ce5f52a74543c4f01b3fa54c6eaaa335aefe4fecd6724598b4881a797703e71ea0705d5b60dd5c17069e8ff341cfab3505796765087cac8cf1d76762b1a87b3f88f8ab82819585037e11d60082ea60949d8be94d0612170ce533ac4d7b43cc3cd91e5a1a80b844a9059cbb0000000000000000000000004ecb2e16071b24cbcea762eb32b6c5f652ba135600000000000000000000000000000000000000000000000068155a43676e000025a0e573028b876e597d9f183853aefa7a9b217b98d8ee95e67f0de38518a8a92150a060f39fa122d2207de07706fb97f2e0c06f2a386a46879b4e3927068282961c64f8ac8206558501dcd6500083043f72943fda67f7583380e67ef93072294a7fac882fd7e780b8444b8a3529000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc200000000000000000000000000000000000000000000001158e460913d00000026a03a65c2bebd39c1a642b353b69ff271402928bd94fa60c1d4c929be9915ecfe14a0132f5633a8db13c27c9cf22214faa919a566cf305843866ac158b4986f7e67d8f8aa8085012a05f20083030d4094a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4880b844a9059cbb000000000000000000000000834252e6765ecfd0e5fb2d75babb37e92ca325f70000000000000000000000000000000000000000000000000000000001f74ae825a02115c287be855299d97a7660a007f11b4ffdb9af74f729b3c5f08159de0d314aa019ebc4185dbf09895c64b0d704a24b889ec1476411d69b96bae4ce963ea7bd05f9054c82481384ee6b280083118c309485c5c26dc2af5546341fc1988b9d178148b4838b80b904e4ab5898e80000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004805ba083d80b5c41c06b27cc18fa4760c34adbcc9000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000084b6f9385d0000000000000000000000008c2036ce61648fcddffb06d6d11fe0b479ed63fe0000000000000000000000000e0989b1f9b8a38983c2ba8053269ca62ec9b195000000000000000000000000000000000000000000000000000001ed90361f220000000000000000000000000000000000000000000000000a67d12d5f0da44e5ba083d80b5c41c06b27cc18fa4760c34adbcc90000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a4cf0b3890000000000000000000000000798abda6cc246d0edba912092a2a3dbd3d11191b0000000000000000000000000e0989b1f9b8a38983c2ba8053269ca62ec9b19500000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000a67d12d5f0da44e0000000000000000000000000000000000000000000005fca2a39c1cfadd7821818e6fecd516ecc3849daf6845e3ec868087b7550000000000000000000000000000000000000000000000000a67d12d5f0da44e00000000000000000000000000000000000000000000000000000000000000e4cb3c28c7000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0000000000000000000000000000000000000000000000000a67d12d5f0da44e0000000000000000000000000e0989b1f9b8a38983c2ba8053269ca62ec9b19500000000000000000000000085c5c26dc2af5546341fc1988b9d178148b4838b80000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005fca2a39c1cfadd7821000000000000000000000000c9d81352fbdb0294b091e51d774a0652ef776d998c2036ce61648fcddffb06d6d11fe0b479ed63fe00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000124f0843ba90000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000001ed90361f22000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000050000000000000000000000000e0989b1f9b8a38983c2ba8053269ca62ec9b195000000000000000000000000a5f2a49aafa052e28a50a575cd9e7488fa598e780000000000000000000000001f573d6fb3f13d689ff844b4ce37794d79a7ff1c0000000000000000000000001f573d6fb3f13d689ff844b4ce37794d79a7ff1c000000000000000000000000c0829421c1d260bd3cb3e0f06cfe2d52db2ce31526a0b2438c181f805815b353e39c1f897174245bcccd20d90b2e795bff8b981dfafba06ce942f74de253a66a0c07e42930500612eb6c7ed250367559f4366e7c353df7f8cb82016884b2d05e00830911d894a9203f3303126243c8d181006ab03b2474e3c08480b8645ca1bc122a010001010001020000000000000001000000000000000000000000000006212a010001010001010000000000000001000000000000000000000000000002a30000000000000000000000001320994fa466e19f17b143995999c7275eae50e126a05aee510ebe1654f15b5c6a833739f24376b93813cc6477505cbd07b81ed404e0a018d05f9d0b5a20b9221bce7d17db3ef366a22b598e7964d00a7c46dfb9829171f8f10484b2d05e00830927c094ae9b8e05c22bae74d1e8db82c4af122b18050bd488016345785d8a0000b88429675f29000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000c1ca0f7cf9bc0a7a7207593f7e14a0d3e64afe06b340df8c93718228a0cef50b6bac7a02cf925c2c9bcae0e2dcab43f800d80971f1881f5c4f3936ac1f5a597435a8793f8ab82058884b2d05e00830249f094fbc6336ea5319daba3a1d6fa3028fc54a9022f9a80b844a9059cbb000000000000000000000000ce85247b032f7528ba97396f7b17c76d5d034d2f0000000000000000000000000000000000000000000000463ff6dcd0494d37801ba02f9aea2819106010bee38848d7dc762e22b17c73dc56fffd0bb831629a373f1ea067904183f2f5676b6412fba535de4ae313fa790d4ffdcbe1f366cfe9a65ea596f8eb8208418459682f00831b53a69468ed06af5989e05bc4aa510b44dc6d003e22518780b8841c203612000000000000000000000000000000000000000000000000000000000000077100000000000000000000000000000000000000000000000000000000000002be0000000000000000000000000000000000000000000000000000000000000032000000000000000000000000000000000000000000000000000000000000005025a0f85c14d302615ed9de3abb5de6f9d48e39dd2697ecfbb177dbeed2a7d4f6302fa04863547319acceaa3be7087a3b178729b60ce2ace851913e9e7a3ac16bb7a56bf901ab81b4844d7c6d0083047b3b9495daaab98046846bf4b2853e23cba236fa394a3180b90144f87883820000000000000000000000000000000000000000000000000000000059682f000000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000012000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000aeb3000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000026a011210cf8142638b4a2ace88d1210aeed2c2c9f30408a0da005f8c01fc3be846fa05025656481ad3753baae5d8b24923656463a65d1423448589820547d93f805aaf864678447868c00832dc6c0946ba7929b6738d38d4217f41f14604a92251c906d808026a06254c258df3e217ccb793ee4bd5557e5a5abd72f03b03bc082b3ef1e0c404bc2a07b3809014fac7429441c0a969c9265798478a887265ee37febec71d1f00814a6f889822af18447868c0082ea6094445f51299ef3307dbd75036dd896565f5b4bf7a580a442966c680000000000000000000000000000000000000000000000056bc75e2d6310000026a0a04f92dc7d722667d12efb87083c1c33c6c61bd2a6dde5925c354023ba7d3df6a007e41b83683a8571bd9f2a279fb7e50262bf133988cff2d4fda2f9a916a35dbdf8eb8201598447868c0083066f949406a6a7af298129e3a2ab396c9c06f91d3c54aba880b8843d7d3f5a0000000000000000000000000000000000000000000000000000000000008464000000000000000000000000000000000000000000000000006a94d74f430000000000000000000000000000000000000000000000000000005c5edcbc290000000000000000000000000000000000000000000000000000000000000003f48025a01272262a5901c754177ca4e27b6843ea30f72dec81439cda1c0b12caea6a794da079790598215a04f197f2ed4c7267dd4f17a5edf2434f0c7bbc04e1b8af66c0a9f8a980843c42a2c083030d4094ba7435a4b4c747e0101780073eeda872a69bdcd480b844a9059cbb000000000000000000000000ebe8cbfd258084cf15eaef462e72d9423e72825900000000000000000000000000000000000000000000005a89445686751ec1191ba0707625a1a198d4236e096a417a20e3db4bc263b7419586f4733f665e17267ca3a038d7e37acbf048c73ac79e7af2a1b6d12efdc0e9df438538d907fb1c2819d606f8a980843c42a2c083030d4094ba7435a4b4c747e0101780073eeda872a69bdcd480b844a9059cbb000000000000000000000000ebe8cbfd258084cf15eaef462e72d9423e72825900000000000000000000000000000000000000000000005a8b53f4f02a0d3fc51ba0c9f6f220da03610362d54606952fa3da54d10fc23840f5c8cc41774e84125efca02e8d1d576cb49e3fdf8ac4a6fb5552028471f0c514817784e8ee435dbabbc17df8a980843c42a2c083030d4094ba7435a4b4c747e0101780073eeda872a69bdcd480b844a9059cbb000000000000000000000000ebe8cbfd258084cf15eaef462e72d9423e72825900000000000000000000000000000000000000000000005a8b53f4f02a0d3fc51ca0dcf59c9941e0bcfb46c07441ab05723f4d3f74ecc080b6ce51560ea7df7bbf34a07a84ee6b1cff1b7b598cce92db3ad2e1be9860c61330a651172db16f8559262af8a904843c42a2c083030d4094ba7435a4b4c747e0101780073eeda872a69bdcd480b844a9059cbb000000000000000000000000ebe8cbfd258084cf15eaef462e72d9423e72825900000000000000000000000000000000000000000000005a89445686751ec1191ca0b865745409be47cd90522ad625f2718f8416476abc2dc9072c177826a5028fd1a05b7163dc640d4f7a5069d6172354f6d0f372a1b032df66fe4e68f7541f13db59f8a980843c42a2c083030d4094ba7435a4b4c747e0101780073eeda872a69bdcd480b844a9059cbb000000000000000000000000ebe8cbfd258084cf15eaef462e72d9423e72825900000000000000000000000000000000000000000000005a89445686751ec1191ca04eddba6388aef2e7d0d00800fdebd106b32249d132a9582841130ece5b35f1f1a015e9af67d502ab4e337d622efe7ee1bfb6a1a0e8e986d2045400932e2f66211ff8a980843c42a2c083030d4094ba7435a4b4c747e0101780073eeda872a69bdcd480b844a9059cbb000000000000000000000000ebe8cbfd258084cf15eaef462e72d9423e72825900000000000000000000000000000000000000000000005a8b53f4f02a0d3fc51ba03daa71372a8a938fab8678bd6a2ddb6211f6532b6a10d2a476f3fe42bdb31a3fa06fc62840b0f0906222ab4f4c19abc97b7b0f95688398149e4946a726adb7ad65f8a980843c42a2c083030d4094ba7435a4b4c747e0101780073eeda872a69bdcd480b844a9059cbb000000000000000000000000ebe8cbfd258084cf15eaef462e72d9423e72825900000000000000000000000000000000000000000000005a8b53f4f02a0d3fc51ca07db5df309b194e9ef7244cb3cc6dc29dae7ab631f39a6ca6898767b852a5f844a0158fc48452203671ad090195c953fda5434fd71b4e84ad5ef255517a06b6783cf8a980843c42a2c083030d4094ba7435a4b4c747e0101780073eeda872a69bdcd480b844a9059cbb000000000000000000000000ebe8cbfd258084cf15eaef462e72d9423e72825900000000000000000000000000000000000000000000005a89445686751ec1191ca0338e1da08c635d15c8317ac725259a718f909defc8bb26017a58285ae5ac7f3ca06ce0add5e56be35204d7d132d27daf2ed63bf2b4e3ed6ea7874ef27bc0aa8d8ff8a980843c42a2c083030d4094ba7435a4b4c747e0101780073eeda872a69bdcd480b844a9059cbb000000000000000000000000ebe8cbfd258084cf15eaef462e72d9423e72825900000000000000000000000000000000000000000000005a89445686751ec1191ba08e6e6dffc612215ac67eb0c139a33885080829704ff2a8dcf1558db60136dccfa050062a6d92046677cc78a773ade4b02cf0ce6550c1a59620544860beec24849cf8a980843c42a2c083030d4094ba7435a4b4c747e0101780073eeda872a69bdcd480b844a9059cbb000000000000000000000000ebe8cbfd258084cf15eaef462e72d9423e72825900000000000000000000000000000000000000000000005a8b53f4f02a0d3fc51ba0f97dab9edc6b50fe2bfb0d80e0232cfdcc7b9f05f98de98fc05fa22c6d56bc0ea06e86bcbdfb7a1315e9351e98bba2e1b3e86ef44f05c2f46f9c9938d21cfde21cf8a980843c42a2c083030d4094ba7435a4b4c747e0101780073eeda872a69bdcd480b844a9059cbb000000000000000000000000ebe8cbfd258084cf15eaef462e72d9423e72825900000000000000000000000000000000000000000000005a8b53f4f02a0d3fc51ca092e733b81b8c3a44df600d372131d02816157756faa736e293c45d51becce2cda019558326296ead9057736e0f90ea339f871981bd8a798cc52f1c1803aee982d6f8a980843c42a2c083030d4094ba7435a4b4c747e0101780073eeda872a69bdcd480b844a9059cbb000000000000000000000000ebe8cbfd258084cf15eaef462e72d9423e72825900000000000000000000000000000000000000000000005a89445686751ec1191ca04b4af2b2b690ad4e34f03604acd8fedb070f249fd742208c9e058838a3022424a02a2f39a0629b05fa90c49fc7995412046c8823dd552f23b35fe5eee0c68d81e2f8a980843c42a2c083030d4094ba7435a4b4c747e0101780073eeda872a69bdcd480b844a9059cbb000000000000000000000000ebe8cbfd258084cf15eaef462e72d9423e72825900000000000000000000000000000000000000000000005a89445686751ec1191ba02f1734413f6f2fa69639dd62afb522e660cc065f20571184920936e155633f7aa0055aa18ceb63255251a79e296d43c6405b36c86886800e942fb0398b785fb5f7f8a908843c42a2c083030d4094ba7435a4b4c747e0101780073eeda872a69bdcd480b844a9059cbb000000000000000000000000ebe8cbfd258084cf15eaef462e72d9423e72825900000000000000000000000000000000000000000000005a89445686751ec1191ca0c526ad74cfa969b7dcfaef03e75f6db2e59d6c4d14fd839f03ecaf587aefdb19a005c1e3f6c8b83d29354dc293c4c54ebbd04f23d85e84cae172f1094a9106b626f8a980843c42a2c083030d4094ba7435a4b4c747e0101780073eeda872a69bdcd480b844a9059cbb000000000000000000000000ebe8cbfd258084cf15eaef462e72d9423e72825900000000000000000000000000000000000000000000005a8b53f4f02a0d3fc51ba0237995306278debb7af5d460f6a25f826aa779508a65e20063ad0357a6fbd7daa01a3d087a5402d238670703d990b854ee5311894bdca42c4448592b5c7891a116f8a980843c42a2c083030d4094ba7435a4b4c747e0101780073eeda872a69bdcd480b844a9059cbb000000000000000000000000ebe8cbfd258084cf15eaef462e72d9423e72825900000000000000000000000000000000000000000000005a8b53f4f02a0d3fc51ca001230550cbf164c336d7f6fc12b71de698c75bc84ddd78964e42376d835c2dc4a0100a788659c240423c92c08d03d559210c45ce2caabeb04534da4d333d02f8eff8a904843c42a2c083030d4094ba7435a4b4c747e0101780073eeda872a69bdcd480b844a9059cbb000000000000000000000000ebe8cbfd258084cf15eaef462e72d9423e72825900000000000000000000000000000000000000000000005a89445686751ec1191ca025a5cc5678157c66e49bf926a864eedffaea3630decb70fbd3767c3603eb044fa044be753b42acb0b59f52d96d04876a5c5d279d8d4a1591b46426888cf2e5d27af8a980843c42a2c083030d4094ba7435a4b4c747e0101780073eeda872a69bdcd480b844a9059cbb000000000000000000000000ebe8cbfd258084cf15eaef462e72d9423e72825900000000000000000000000000000000000000000000005a8b53f4f02a0d3fc51ba0d38fc4580fca1dfd2e0c84fc7fd0672a5104ef00fb88d902eba79ca01b892b4ca05460b7d1a2be06b2e3c180c7b8217b7423f59acd9456898239d8bb00d3b9ac15f8a980843c42a2c083030d4094ba7435a4b4c747e0101780073eeda872a69bdcd480b844a9059cbb000000000000000000000000ebe8cbfd258084cf15eaef462e72d9423e72825900000000000000000000000000000000000000000000005a8b53f4f02a0d3fc51ba0cb6665efe780ed13ea08329392f1e35e654cb3ab6bf1df93a4e529f8d2ef52b2a02043941faa92814ab5768f1d9b2666e8ddd2888a13aa29b6e15bf87b48c6497ef8a804843c42a2c083030d4094ba7435a4b4c747e0101780073eeda872a69bdcd480b844a9059cbb000000000000000000000000ebe8cbfd258084cf15eaef462e72d9423e72825900000000000000000000000000000000000000000000005a89445686751ec1191ba05004d58ccc07fe00669ee2b993cf1272a92f405bee31174a0f2a89a7cc98f6ce9f9223f2b94300cb68299b04c91f2449be4e7a55dd20beff835bd902457cde69f8a908843c42a2c083030d4094ba7435a4b4c747e0101780073eeda872a69bdcd480b844a9059cbb000000000000000000000000ebe8cbfd258084cf15eaef462e72d9423e72825900000000000000000000000000000000000000000000005a89445686751ec1191ba07b4678f18625f149db381ebb418e9f354a4ed4c0db1d760e4b1923385bcb6d4fa03fdbd4f4e2f5539939ab36b3f4308162682ab736fbb2857b6aa8b3c34f52e261f8a822843c33608082ea609407241118626a7bbb604be4b9ef8ef12e78fd087180b844a9059cbb000000000000000000000000a93b5270d6bfb419f31b9d6ebc458fe8c494f3b00000000000000000000000000000000000000000000000056bc75e2d631000001ca0a1311eb69ab1d0291512e4f7b223c96700557ecddd3d2e39eb006781a27a2d61a0368c9635e84c73330b5570de5ef90267d369cb300be493512cc678cb2994edbaf8a83b843c33608082ea609407241118626a7bbb604be4b9ef8ef12e78fd087180b844a9059cbb000000000000000000000000a93b5270d6bfb419f31b9d6ebc458fe8c494f3b00000000000000000000000000000000000000000000000056bc75e2d631000001ba0f5c7ff18d47bb842d52d5f6c941b97a0bef27411269f1c2462a559e910510084a02cc946a524e3fcf9f7df2a5aa2287f3c51fe648e01ecc01033b37a1bab657482f8a831843c33608082ea609407241118626a7bbb604be4b9ef8ef12e78fd087180b844a9059cbb000000000000000000000000a93b5270d6bfb419f31b9d6ebc458fe8c494f3b00000000000000000000000000000000000000000000000056bc75e2d631000001ca0397effe52d4ca1d63cb8d0b00fba4dc2761d86eb17521cc1acf7e12c91a8b93aa031a00525e63d5e0eb8e2e548b4b54cb34ad9a4c96d333e2d09b10240e8c52a44c0'

const { Client } = jayson

const main = async () => {
  const ultralights: HttpClient[] = []
  const enrs: string[] = []
  const nodeIds: string[] = []
  for (let i = 0; i < 2; i++) {
    const ultralight = Client.http({ host: '0.0.0.0', port: 8545 + i })
    const ultralightENR = await ultralight.request('discv5_nodeInfo', [])
    console.log(ultralightENR)
    ultralights.push(ultralight)
    enrs.push(ultralightENR.result.enr)
    nodeIds.push(ultralightENR.result.nodeId)
  }

  const res = await ultralights[0].request('portal_historyStore', [contentKey, content])
  console.log(res.result)
  await new Promise((res) => {
    setTimeout(res, 1000)
  })
  const stored = await ultralights[0].request('portal_historyLocalContent', [contentKey])
  console.log(stored.result)

  const findContentRes = await ultralights[1].request('portal_historyRecursiveFindContent', [
    contentKey,
  ])
  console.log(findContentRes)
}

void main()
