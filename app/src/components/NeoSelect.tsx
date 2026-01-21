import { Listbox, ListboxButton, ListboxOption, ListboxOptions, Transition } from '@headlessui/react'
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid'
import { Fragment } from 'react'

interface NeoSelectProps<T extends string | number | boolean> {
    value: T
    onChange: (value: T) => void
    options: { value: T; label: string }[]
    disabled?: boolean
    className?: string
    placeholder?: string
}

export default function NeoSelect<T extends string | number | boolean>({
    value,
    onChange,
    options,
    disabled = false,
    className = '',
    placeholder = 'Select...'
}: NeoSelectProps<T>) {
    const selectedOption = options.find(o => o.value === value)

    return (
        <Listbox value={value} onChange={onChange} disabled={disabled}>
            <div className={`relative ${className}`}>
                <ListboxButton 
                    className={`
                        relative w-full cursor-pointer
                        bg-white text-left 
                        font-mono text-sm font-bold
                        border-[3px] border-black 
                        shadow-[2px_2px_0px_#1a1a2e]
                        focus:outline-none focus:shadow-[4px_4px_0px_#1a1a2e] focus:-translate-y-[2px] focus:-translate-x-[2px]
                        transition-all duration-150
                        disabled:opacity-50 disabled:cursor-not-allowed
                        py-[0.875rem] pl-4 pr-10
                    `}
                >
                    <span className="block truncate">
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                        <ChevronUpDownIcon
                            className="h-5 w-5 text-gray-400"
                            aria-hidden="true"
                        />
                    </span>
                </ListboxButton>
                <Transition
                    as={Fragment}
                    leave="transition ease-in duration-100"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <ListboxOptions 
                        className="
                            absolute mt-1 max-h-60 w-full overflow-auto 
                            bg-white 
                            border-[3px] border-black 
                            shadow-[4px_4px_0px_#1a1a2e]
                            py-1 z-50
                            focus:outline-none
                        "
                    >
                        {options.map((option, optionIdx) => (
                            <ListboxOption
                                key={optionIdx}
                                className={({ active }: { active: boolean }) =>
                                    `relative cursor-pointer select-none py-2 pl-10 pr-4 font-mono text-sm font-bold ${
                                        active ? 'bg-[var(--primary)] text-white' : 'text-gray-900'
                                    }`
                                }
                                value={option.value}
                            >
                                {({ selected }: { selected: boolean }) => (
                                    <>
                                        <span
                                            className={`block truncate ${
                                                selected ? 'font-extrabold' : 'font-normal'
                                            }`}
                                        >
                                            {option.label}
                                        </span>
                                        {selected ? (
                                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--success)]">
                                                <CheckIcon className="h-5 w-5" aria-hidden="true" />
                                            </span>
                                        ) : null}
                                    </>
                                )}
                            </ListboxOption>
                        ))}
                    </ListboxOptions>
                </Transition>
            </div>
        </Listbox>
    )
}
