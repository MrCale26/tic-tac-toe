export const Square = ({ children, isSelected, updateBoard, index }) => {
  const className = `square ${isSelected ? 'is-selected' : ''}`

  const handleClick = () => {
    if (updateBoard) updateBoard(index)
  }

  return (
    <button className={className} onClick={handleClick} type='button'>
      {children}
    </button>
  )
}
