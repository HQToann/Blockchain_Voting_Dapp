// File dùng deploy contract

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule(
    "FactoryModule", (m) =>  {
        // Deploy ElectionFactory contract
        const factory = m.contract("ElectionFactory");

        return {
            factory
        };
    }
)