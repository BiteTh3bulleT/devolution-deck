//! DEVOLUTION//DECK — desktop entry point.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    devolution_deck_lib::run();
}
