from fastapi import HTTPException, status

class DatabaseConnectionError(HTTPException):
    def __init__(self, detail: str = "Database connection failed."):
        super().__init__(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=detail)

class RecordNotFoundError(HTTPException):
    def __init__(self, detail: str = "The requested record was not found."):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail)

class InvalidStateError(HTTPException):
    def __init__(self, detail: str = "Invalid operation for the current state."):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)