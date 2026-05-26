from dataclasses import dataclass

from app.board_mapping import board_for_area, guess_area_path_from_board_name


@dataclass
class BoardStub:
    id: str
    name: str
    area_path: str | None = None


def test_guess_digital_inbox_area() -> None:
    assert guess_area_path_from_board_name("Digital Inbox") == "Tele2\\Digital\\Streams\\Inbox"


def test_guess_digital_streams_b2b_area() -> None:
    assert guess_area_path_from_board_name("Digital Streams B2b") == "Tele2\\Digital\\Streams\\B2b"


def test_guess_streams_service_ecommerce_product() -> None:
    assert guess_area_path_from_board_name("Service") == "Tele2\\Digital\\Streams\\Service"
    assert guess_area_path_from_board_name("eCommerce") == "Tele2\\Digital\\Streams\\eCommerce"
    assert guess_area_path_from_board_name("Product_1") == "Tele2\\Digital\\Streams\\Product_1"


def test_streams_board_display_name() -> None:
    from app.board_mapping import streams_board_display_name

    assert streams_board_display_name("Tele2\\Digital\\Streams\\Service") == "Digital Streams Service"
    assert streams_board_display_name("Tele2\\Digital\\Streams\\Inbox") == "Digital Inbox"


def test_board_for_area_prefix_longest() -> None:
    boards = [
        BoardStub("1", "Digital Inbox", "Tele2\\Digital\\Streams\\Inbox"),
        BoardStub("2", "Digital Streams B2b", "Tele2\\Digital\\Streams\\B2b"),
    ]
    matched = board_for_area(boards, "Tele2\\Digital\\Streams\\B2b\\Feature")
    assert matched is not None
    assert matched.name == "Digital Streams B2b"


def test_board_for_area_streams_leaf_inbox() -> None:
    boards = [
        BoardStub("1", "Digital Inbox"),
        BoardStub("2", "Digital Streams B2b"),
    ]
    matched = board_for_area(boards, "Tele2\\Digital\\Streams\\Inbox")
    assert matched is not None
    assert matched.name == "Digital Inbox"


def test_board_for_area_does_not_match_digital_token_everywhere() -> None:
    boards = [BoardStub("1", "Digital Inbox", "Tele2\\Digital\\Streams\\Inbox")]
    matched = board_for_area(boards, "Tele2\\LK B2B\\SomeStream")
    assert matched is None


def test_board_for_area_other_team_path() -> None:
    boards = [
        BoardStub("1", "Digital Inbox", "Tele2\\Digital\\Streams\\Inbox"),
        BoardStub("2", "Yustas digital", "Tele2\\Yustas\\Digital"),
    ]
    matched = board_for_area(boards, "Tele2\\Yustas\\Digital\\Change")
    assert matched is not None
    assert matched.name == "Yustas digital"
