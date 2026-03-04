pub mod error;
pub mod instruction;
pub mod processor;
pub mod state;

#[cfg(not(feature = "no-entrypoint"))]
use solana_security_txt::security_txt;

#[cfg(not(feature = "no-entrypoint"))]
security_txt! {
    name: "Aureus Arena",
    project_url: "https://aureusarena.com",
    contacts: "email:aureusarena@proton.me",
    policy: "https://github.com/aureusarena/aureus/blob/main/SECURITY.md",
    preferred_languages: "en",
    source_code: "https://github.com/aureusarena/aureus/tree/main/program",
    auditors: "N/A"
}

#[cfg(not(feature = "no-entrypoint"))]
mod entrypoint {
    use solana_program::{
        account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, pubkey::Pubkey,
    };

    use crate::processor::Processor;

    entrypoint!(process_instruction);

    fn process_instruction(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        Processor::process(program_id, accounts, instruction_data)
    }
}
