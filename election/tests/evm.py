"""
Hạ tầng test: EVM thật (py-evm qua eth-tester) + contract Factory mới biên dịch từ Hardhat.
Cần chạy `npx hardhat compile` trước (tạo artifacts/). Nếu thiếu, các test dùng EVM tự động bị bỏ qua.
"""
import json
import os
import unittest
from django.conf import settings
from web3 import Web3, EthereumTesterProvider

ART = os.path.join(settings.BASE_DIR, 'artifacts', 'blockchain', 'contracts', 'VotingSystem.sol', 'ElectionFactory.json')
HAS_ARTIFACT = os.path.exists(ART)
try:
    import eth_tester  # chỉ để kiểm tra đã cài
    HAS_TESTER = True
except ImportError:
    HAS_TESTER = False

requires_evm = unittest.skipUnless(HAS_ARTIFACT and HAS_TESTER, 'Cần `npx hardhat compile` và `pip install eth-tester[py-evm]`')


class Chain:
    """Một chain EVM tạm + Factory đã deploy. Có helper tạo hòm phiếu / bỏ phiếu như người dùng thật."""

    def __init__(self, deployer=0):
        self.w3 = Web3(EthereumTesterProvider())
        self.accounts = self.w3.eth.accounts
        art = json.load(open(ART))
        self.factory_abi = art['abi']
        c = self.w3.eth.contract(abi=art['abi'], bytecode=art['bytecode'])
        r = self.w3.eth.wait_for_transaction_receipt(c.constructor().transact({'from': self.accounts[deployer], 'gas': 6_000_000}))
        self.factory_address = r.contractAddress
        self.factory = self.w3.eth.contract(address=r.contractAddress, abi=art['abi'])
        self.election_abi = json.load(open(os.path.join(settings.BASE_DIR, 'Election_ABI.json')))

    def now(self):
        return self.w3.eth.get_block('latest')['timestamp']

    def create(self, owner, **over):
        p = dict(name='Bau lop', metadataURI='', kind=0, isPrivate=False, maxChoices=1, startTime=0, endTime=0,
                 options=['An', 'Binh', 'Chi'])
        p.update(over)
        tx = self.factory.functions.createElection((p['name'], p['metadataURI'], p['kind'], p['isPrivate'],
                                                    p['maxChoices'], p['startTime'], p['endTime'], p['options'])
                                                   ).transact({'from': owner, 'gas': 6_000_000})
        r = self.w3.eth.wait_for_transaction_receipt(tx)
        addr = self.factory.events.ElectionCreated().process_receipt(r)[0]['args']['election']
        return self.w3.eth.contract(address=addr, abi=self.election_abi)

    def send(self, fn, sender):
        return self.w3.eth.wait_for_transaction_receipt(fn.transact({'from': sender, 'gas': 3_000_000}))

    def logs(self, from_block=0, addresses=None):
        flt = {'fromBlock': from_block, 'toBlock': 'latest'}
        if addresses:
            flt['address'] = addresses
        return sorted(self.w3.eth.get_logs(flt), key=lambda l: (l['blockNumber'], l['logIndex']))

    def travel(self, timestamp):
        self.w3.provider.ethereum_tester.time_travel(timestamp)
        self.w3.provider.ethereum_tester.mine_block()
