from datetime import datetime
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    id: str
    username: str
    role: str
    display_name: str | None = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class CreateUserRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=4, max_length=128)
    role: str = Field("user", pattern="^(admin|user)$")
    display_name: str | None = Field(None, max_length=128)


class UpdatePasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=4, max_length=128)


TokenResponse.model_rebuild()
